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
	instructions: `Convert a clinical question into a precise SQL intent using only the provided schema.

Identify the relevant tables, columns, joins, filters, ordering, grouping, and aggregations.
Preserve patientId constraints when present.
Do not invent tables or columns. Do not write SQL.
Keep schemaContext to the minimum schema excerpt needed for SQL generation.

Output JSON only:
{"refinedSqlIntent":"...","relevantTables":["..."],"schemaContext":"..."}`,
	model: "openrouter/google/gemini-2.5-flash",
});

const sqlGenerationAgent = new Agent({
	id: "sql-pipeline-generation-agent",
	name: "sql-pipeline-generation-agent",
	description: "Generates a PostgreSQL query from a refined SQL intent",
	instructions: `Generate one safe PostgreSQL read query from the SQL intent and schema context.

Rules:
- Output SQL only. No markdown, prose, or comments.
- Use only SELECT or WITH ... SELECT.
- Use only tables and columns present in schemaContext.
- Include patientId and other filters described in the intent.
- Qualify ambiguous columns with table aliases.
- Add a LIMIT when the query can return multiple rows.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, or EXECUTE.`,
	model: "openrouter/qwen/qwen3-coder-next",
});

const sqlValidationAgent = new Agent({
	id: "sql-pipeline-validation-agent",
	name: "sql-pipeline-validation-agent",
	description: "Validates SQL queries for correctness and safety",
	instructions: `Validate a PostgreSQL query before execution.

Return exactly one line:
- VALID
- INVALID: <specific reason>

Reject any query that:
- is not a single SELECT or WITH ... SELECT statement
- references tables or columns not shown in the schema context
- performs writes, DDL, permissions changes, procedure calls, or dynamic execution
- lacks required patientId filters from the intent
- has obvious PostgreSQL syntax errors
- can return many rows without a LIMIT`,
	model: "openrouter/deepseek/deepseek-r1",
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

			const valPrompt = `SQL Intent: ${refinedSqlIntent}
Schema Context:\n${schemaContext}

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
