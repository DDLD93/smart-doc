import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { requestAgentApi } from "../tools/agentApiClient";
import { errorMessageFromUnknown } from "../tools/toolResultUtils";

// ─── Agents ───────────────────────────────────────────────────────────────────

const sqlRefinementAgent = new Agent({
	id: "sql-pipeline-refinement-agent",
	name: "sql-pipeline-refinement-agent",
	description: "Refines SQL intent given the database schema",
	instructions: `You are a clinical SQL intent analyst.
Given a database schema, the original clinical question, and an optional SQL hint, produce a precise SQL intent description.
Identify: the relevant tables, the exact columns needed, the WHERE conditions, JOIN relationships, and any aggregations.
Do NOT write the full SQL query — describe intent only.

Respond with JSON only, no markdown fences:
{"refinedSqlIntent": "<precise intent description>", "relevantTables": ["<table1>", ...], "schemaContext": "<minimal relevant schema excerpt as string>"}`,
	model: "google/gemini-2.5-flash",
});

const sqlGenerationAgent = new Agent({
	id: "sql-pipeline-generation-agent",
	name: "sql-pipeline-generation-agent",
	description: "Generates a PostgreSQL query from a refined SQL intent",
	instructions: `You translate clinical SQL intent descriptions into a single valid PostgreSQL SELECT statement.
Output ONLY the SQL. No markdown fences, no explanations.
Use only SELECT or WITH...SELECT. Never DROP/DELETE/UPDATE/INSERT.
Limit result sets to reasonable sizes using LIMIT.`,
	model: "google/gemini-2.5-flash",
});

const sqlValidationAgent = new Agent({
	id: "sql-pipeline-validation-agent",
	name: "sql-pipeline-validation-agent",
	description: "Validates SQL queries for correctness and safety",
	instructions: `Review the SQL query for PostgreSQL syntax correctness, safety, and logic.
Return "VALID" if safe to execute.
Return "INVALID: <specific reason>" if not.
Flag: destructive operations, syntax errors, unqualified table references, unbounded queries.`,
	model: "google/gemini-2.5-flash",
});

// ─── Step 1: sql-refine-intent ────────────────────────────────────────────────

const refineSqlIntentStep = createStep({
	id: "sql-refine-intent",
	inputSchema: z.object({
		question: z.string().min(1),
		sqlHint: z.string().nullable().optional(),
		patientId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int().optional(),
	}),
	outputSchema: z.object({
		question: z.string(),
		refinedSqlIntent: z.string(),
		relevantTables: z.array(z.string()),
		schemaContext: z.string(),
		patientId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	execute: async ({ inputData }) => {
		const { question, sqlHint, patientId, baseUrl } = inputData;
		const limit = inputData.limit ?? 50;

		try {
			let schemaJson = "{}";
			try {
				const schemaPayload = await requestAgentApi<unknown>({ method: "GET", path: "/agent/sql/schema", baseUrl });
				schemaJson = JSON.stringify(schemaPayload, null, 2);
			} catch {
				// proceed with empty schema — generation agent will handle gracefully
			}

			const prompt = `Database Schema:\n${schemaJson}\n\nOriginal clinical question: "${question}"${sqlHint ? `\nSQL hint: ${sqlHint}` : ""}${patientId ? `\nFilter context: patientId = ${patientId}` : ""}\n\nProduce a precise SQL intent description. Identify relevant tables, columns, and WHERE conditions.`;

			const { text } = await sqlRefinementAgent.generate([{ role: "user", content: prompt }]);

			let parsed: { refinedSqlIntent?: string; relevantTables?: string[]; schemaContext?: string };
			try {
				parsed = JSON.parse(text.trim());
			} catch {
				parsed = { refinedSqlIntent: text.trim(), relevantTables: [], schemaContext: schemaJson.slice(0, 2000) };
			}

			return {
				question,
				refinedSqlIntent: parsed.refinedSqlIntent ?? text.trim(),
				relevantTables: parsed.relevantTables ?? [],
				schemaContext: parsed.schemaContext ?? schemaJson.slice(0, 2000),
				patientId,
				baseUrl,
				limit,
			};
		} catch (error) {
			return {
				question,
				refinedSqlIntent: `SQL intent refinement failed: ${errorMessageFromUnknown(error)}`,
				relevantTables: [],
				schemaContext: "{}",
				patientId,
				baseUrl,
				limit,
			};
		}
	},
});

// ─── Step 2: sql-generate-validate ───────────────────────────────────────────

const generateAndValidateSqlStep = createStep({
	id: "sql-generate-validate",
	inputSchema: z.object({
		question: z.string(),
		refinedSqlIntent: z.string(),
		schemaContext: z.string(),
		patientId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	outputSchema: z.object({
		sql: z.string(),
		validationResult: z.string(),
		isValid: z.boolean(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	execute: async ({ inputData }) => {
		const { question, refinedSqlIntent, schemaContext, baseUrl, limit } = inputData;

		try {
			const genPrompt = `SQL Intent: ${refinedSqlIntent}
Schema Context:\n${schemaContext}
Original Question: ${question}

Generate a single PostgreSQL SELECT query. Output ONLY SQL.`;

			const { text: rawSql } = await sqlGenerationAgent.generate([{ role: "user", content: genPrompt }]);
			const sql = rawSql
				.replace(/^```(?:sql)?\s*\r?\n?/im, "")
				.replace(/\r?\n?```\s*$/im, "")
				.trim();

			const valPrompt = `Schema Context:\n${schemaContext}

SQL Query:\n${sql}

Validate. Return "VALID" or "INVALID: <reason>".`;

			const { text: validationResult } = await sqlValidationAgent.generate([{ role: "user", content: valPrompt }]);
			const isValid = validationResult.trim().toUpperCase().startsWith("VALID");

			return { sql, validationResult: validationResult.trim(), isValid, baseUrl, limit };
		} catch (error) {
			return {
				sql: "",
				validationResult: `SQL generation/validation step failed: ${errorMessageFromUnknown(error)}`,
				isValid: false,
				baseUrl,
				limit,
			};
		}
	},
});

// ─── Step 3: sql-execute ──────────────────────────────────────────────────────

const executeSqlStep = createStep({
	id: "sql-execute",
	inputSchema: z.object({
		sql: z.string(),
		validationResult: z.string(),
		isValid: z.boolean(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	outputSchema: z.object({
		sql: z.string(),
		validationResult: z.string(),
		rows: z.array(z.unknown()),
		executionSuccess: z.boolean(),
		executionError: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		const { sql, validationResult, isValid, baseUrl, limit } = inputData;

		try {
			if (!isValid) {
				return {
					sql,
					validationResult,
					rows: [],
					executionSuccess: false,
					executionError: `SQL validation failed: ${validationResult}`,
				};
			}

			try {
				const data = await requestAgentApi<{ rows?: unknown[] }>({
					method: "POST",
					path: "/agent/sql/query",
					body: { sql, limit },
					baseUrl,
				});
				const rows = Array.isArray(data?.rows) ? data.rows : [];
				return { sql, validationResult, rows, executionSuccess: true };
			} catch (error) {
				return {
					sql,
					validationResult,
					rows: [],
					executionSuccess: false,
					executionError: errorMessageFromUnknown(error),
				};
			}
		} catch (error) {
			return {
				sql: sql ?? "",
				validationResult: validationResult ?? "",
				rows: [],
				executionSuccess: false,
				executionError: errorMessageFromUnknown(error),
			};
		}
	},
});

// ─── Workflow assembly ────────────────────────────────────────────────────────

export const sqlPipelineWorkflow = createWorkflow({
	id: "sql-pipeline-workflow",
	description: "Fetch schema, refine SQL intent, generate and validate a PostgreSQL query, then execute it",
	inputSchema: z.object({
		question: z.string().min(1),
		sqlHint: z.string().nullable().optional(),
		patientId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int().min(1).max(200).optional(),
	}),
	outputSchema: z.object({
		sql: z.string(),
		validationResult: z.string(),
		rows: z.array(z.unknown()),
		executionSuccess: z.boolean(),
		executionError: z.string().optional(),
	}),
})
	.then(refineSqlIntentStep)
	.then(generateAndValidateSqlStep)
	.then(executeSqlStep)
	.commit();
