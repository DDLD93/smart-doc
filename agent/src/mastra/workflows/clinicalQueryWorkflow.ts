import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { requestAgentApi } from "../tools/agentApiClient";
import { errorMessageFromUnknown } from "../tools/toolResultUtils";

const queryTypeSchema = z.enum(["RAG_DOCS", "RAG_NOTES", "SQL", "BOTH"]);
type QueryType = z.infer<typeof queryTypeSchema>;

const metaFields = {
	patientId: z.string().optional(),
	encounterId: z.string().optional(),
	baseUrl: z.string().optional(),
	limit: z.number().int().optional(),
};

// Wide input schema shared by both parallel RAG steps (must match step 3 full output)
const parallelStepInputSchema = z.object({
	originalQuestion: z.string(),
	refinedQuery: z.string(),
	queryType: queryTypeSchema,
	sqlHint: z.string().nullable().optional(),
	refinedSqlIntent: z.string().optional(),
	relevantTables: z.array(z.string()).optional(),
	schemaContext: z.string().optional(),
	patientId: z.string().optional(),
	encounterId: z.string().optional(),
	baseUrl: z.string().optional(),
	limit: z.number().int(), // required — always set by acceptQueryStep (default 10)
});

const ragOutputSchema = z.object({
	results: z.array(z.unknown()),
	sources: z.array(z.string()),
	total: z.number().optional(),
});

// ─── Sub-agents ──────────────────────────────────────────────────────────────

const queryClassifierAgent = new Agent({
	id: "query-classifier-agent",
	name: "query-classifier-agent",
	description: "Classifies clinical questions and refines them for semantic search",
	instructions: `You are a clinical query classifier and refiner.
Given a clinical question, do two things:
1. Classify it as exactly one of: RAG_DOCS | RAG_NOTES | SQL | BOTH
   - RAG_DOCS: question about uploaded clinical documents (reports, discharge summaries, lab PDFs)
   - RAG_NOTES: question about doctor/clinical progress notes
   - SQL: question best answered by structured database query (counts, aggregates, specific field lookups)
   - BOTH: needs both semantic search AND SQL (e.g. "summarize notes AND show lab counts")
2. Rewrite the question as a refined search query optimised for semantic embedding search.
   Remove filler words, expand abbreviations, preserve clinical specificity.

Respond with JSON only, no markdown fences:
{"queryType": "<RAG_DOCS|RAG_NOTES|SQL|BOTH>", "refinedQuery": "<refined query string>", "sqlHint": "<brief SQL intent if SQL or BOTH, else null>"}`,
	model: "google/gemini-2.5-flash",
});

const sqlStatementRefinementAgent = new Agent({
	id: "sql-statement-refinement-agent",
	name: "sql-statement-refinement-agent",
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
	id: "clinical-sql-generation-agent",
	name: "clinical-sql-generation-agent",
	description: "Generates a PostgreSQL query from a refined SQL intent",
	instructions: `You translate clinical SQL intent descriptions into a single valid PostgreSQL SELECT statement.
Output ONLY the SQL. No markdown fences, no explanations.
Use only SELECT or WITH...SELECT. Never DROP/DELETE/UPDATE/INSERT.
Limit result sets to reasonable sizes using LIMIT.`,
	model: "google/gemini-2.5-flash",
});

const sqlValidationAgent = new Agent({
	id: "clinical-sql-validation-agent",
	name: "clinical-sql-validation-agent",
	description: "Validates SQL queries for correctness and safety",
	instructions: `Review the SQL query for PostgreSQL syntax correctness, safety, and logic.
Return "VALID" if safe to execute.
Return "INVALID: <specific reason>" if not.
Flag: destructive operations, syntax errors, unqualified table references, unbounded queries.`,
	model: "google/gemini-2.5-flash",
});

const clinicalSynthesisAgent = new Agent({
	id: "clinical-synthesis-agent",
	name: "clinical-synthesis-agent",
	description: "Synthesizes RAG results and SQL rows into a coherent clinical answer",
	instructions: `You are a clinical information synthesis specialist.
Given a clinical question, doctor note search results, document search results, and optional SQL data rows:
1. Synthesize a clear, accurate answer that directly addresses the question.
2. Cite sources by referencing filenames, note IDs, or record identifiers where available.
3. If SQL data conflicts with narrative notes, prefer the most recent information; flag the discrepancy.
4. Never fabricate clinical facts. If evidence is insufficient, say so explicitly.
5. Format: direct answer first, then supporting evidence summary.`,
	model: "google/gemini-2.5-flash",
});

// ─── Step 1: accept-query ─────────────────────────────────────────────────────

const acceptQueryStep = createStep({
	id: "accept-query",
	inputSchema: z.object({
		question: z.string().min(1),
		...metaFields,
	}),
	outputSchema: z.object({
		question: z.string(),
		...metaFields,
		limit: z.number().int(),
	}),
	execute: async ({ inputData }) => {
		try {
			return {
				question: inputData.question.trim(),
				patientId: inputData.patientId,
				encounterId: inputData.encounterId,
				baseUrl: inputData.baseUrl,
				limit: inputData.limit ?? 10,
			};
		} catch (error) {
			return {
				question: (inputData.question ?? "").trim() || `Accept query failed: ${errorMessageFromUnknown(error)}`,
				patientId: inputData.patientId,
				encounterId: inputData.encounterId,
				baseUrl: inputData.baseUrl,
				limit: inputData.limit ?? 10,
			};
		}
	},
});

// ─── Step 2: classify-and-refine-query ───────────────────────────────────────

const classifyAndRefineQueryStep = createStep({
	id: "classify-and-refine-query",
	inputSchema: z.object({
		question: z.string(),
		...metaFields,
		limit: z.number().int(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuery: z.string(),
		queryType: queryTypeSchema,
		sqlHint: z.string().nullable().optional(),
		...metaFields,
		limit: z.number().int(),
	}),
	execute: async ({ inputData }) => {
		const { question, patientId, encounterId, baseUrl, limit } = inputData;
		try {
			const prompt = `Classify and refine this clinical question for a patient record system.
Question: "${question}"${patientId ? `\nPatient context: patientId=${patientId}` : ""}${encounterId ? `\nEncounter context: encounterId=${encounterId}` : ""}`;

			const { text } = await queryClassifierAgent.generate([{ role: "user", content: prompt }]);

			let parsed: { queryType?: string; refinedQuery?: string; sqlHint?: string | null };
			try {
				parsed = JSON.parse(text.trim());
			} catch {
				parsed = { queryType: "BOTH", refinedQuery: question, sqlHint: null };
			}

			const parsedType = queryTypeSchema.safeParse(parsed.queryType);

			return {
				originalQuestion: question,
				refinedQuery: parsed.refinedQuery ?? question,
				queryType: (parsedType.success ? parsedType.data : "BOTH") as QueryType,
				sqlHint: parsed.sqlHint ?? null,
				patientId,
				encounterId,
				baseUrl,
				limit,
			};
		} catch {
			return {
				originalQuestion: question,
				refinedQuery: question,
				queryType: "BOTH" as QueryType,
				sqlHint: null,
				patientId,
				encounterId,
				baseUrl,
				limit,
			};
		}
	},
});

// ─── Step 3: refine-sql-statement ─────────────────────────────────────────────

const refineSqlStatementStep = createStep({
	id: "refine-sql-statement",
	inputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuery: z.string(),
		queryType: queryTypeSchema,
		sqlHint: z.string().nullable().optional(),
		...metaFields,
		limit: z.number().int(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuery: z.string(),
		queryType: queryTypeSchema,
		sqlHint: z.string().nullable().optional(),
		refinedSqlIntent: z.string().optional(),
		relevantTables: z.array(z.string()).optional(),
		schemaContext: z.string().optional(),
		...metaFields,
		limit: z.number().int(),
	}),
	execute: async ({ inputData }) => {
		const { originalQuestion, refinedQuery, queryType, sqlHint, patientId, encounterId, baseUrl, limit } = inputData;

		try {
			const passthrough = { originalQuestion, refinedQuery, queryType, sqlHint, patientId, encounterId, baseUrl, limit };

			if (queryType === "RAG_DOCS" || queryType === "RAG_NOTES") {
				return { ...passthrough, refinedSqlIntent: undefined, relevantTables: undefined, schemaContext: undefined };
			}

			let schemaJson = "{}";
			try {
				const schemaPayload = await requestAgentApi<unknown>({ method: "GET", path: "/agent/sql/schema", baseUrl });
				schemaJson = JSON.stringify(schemaPayload, null, 2);
			} catch {
				// proceed with empty schema — generation agent will handle gracefully
			}

			const prompt = `Database Schema:\n${schemaJson}\n\nOriginal clinical question: "${originalQuestion}"${sqlHint ? `\nSQL hint: ${sqlHint}` : ""}${patientId ? `\nFilter context: patientId = ${patientId}` : ""}\n\nProduce a precise SQL intent description. Identify relevant tables, columns, and WHERE conditions.`;

			const { text } = await sqlStatementRefinementAgent.generate([{ role: "user", content: prompt }]);

			let parsed: { refinedSqlIntent?: string; relevantTables?: string[]; schemaContext?: string };
			try {
				parsed = JSON.parse(text.trim());
			} catch {
				parsed = { refinedSqlIntent: text.trim(), relevantTables: [], schemaContext: schemaJson.slice(0, 2000) };
			}

			return {
				...passthrough,
				refinedSqlIntent: parsed.refinedSqlIntent ?? text.trim(),
				relevantTables: parsed.relevantTables ?? [],
				schemaContext: parsed.schemaContext ?? schemaJson.slice(0, 2000),
			};
		} catch (error) {
			const passthrough = { originalQuestion, refinedQuery, queryType, sqlHint, patientId, encounterId, baseUrl, limit };
			return {
				...passthrough,
				refinedSqlIntent: `SQL intent refinement failed: ${errorMessageFromUnknown(error)}`,
				relevantTables: [],
				schemaContext: "{}",
			};
		}
	},
});

// ─── Step 4a: search-doctor-notes (parallel branch) ──────────────────────────

const searchDoctorNotesStep = createStep({
	id: "search-doctor-notes",
	inputSchema: parallelStepInputSchema,
	outputSchema: ragOutputSchema,
	execute: async ({ inputData }) => {
		try {
			const { refinedQuery, queryType, patientId, encounterId, baseUrl, limit } = inputData;

			if (queryType === "RAG_DOCS") return { results: [], sources: [], total: 0 };

			try {
				const data = await requestAgentApi<{ results?: unknown[]; total?: number }>({
					method: "POST",
					path: "/agent/rag/search-doctor-notes",
					body: { query: refinedQuery, patientId, encounterId, limit },
					baseUrl,
				});
				const results = Array.isArray(data?.results) ? data.results : [];
				const sources = results
					.map((r: unknown) => {
						const p = (r as Record<string, unknown>)?.payload as Record<string, unknown> | undefined;
						return (p?.noteId ?? p?.id ?? null) as string | null;
					})
					.filter((s): s is string => s !== null);
				return { results, sources, total: data?.total ?? results.length };
			} catch {
				return { results: [], sources: [], total: 0 };
			}
		} catch {
			return { results: [], sources: [], total: 0 };
		}
	},
});

// ─── Step 4b: search-documents (parallel branch) ─────────────────────────────

const searchDocumentsStep = createStep({
	id: "search-documents",
	inputSchema: parallelStepInputSchema,
	outputSchema: ragOutputSchema,
	execute: async ({ inputData }) => {
		try {
			const { refinedQuery, queryType, patientId, baseUrl, limit } = inputData;

			if (queryType === "RAG_NOTES") return { results: [], sources: [], total: 0 };

			try {
				const data = await requestAgentApi<{ results?: unknown[]; total?: number }>({
					method: "POST",
					path: "/agent/rag/search-documents",
					body: { query: refinedQuery, patientId, limit },
					baseUrl,
				});
				const results = Array.isArray(data?.results) ? data.results : [];
				const sources = results
					.map((r: unknown) => {
						const p = (r as Record<string, unknown>)?.payload as Record<string, unknown> | undefined;
						return (p?.filename ?? p?.originalName ?? p?.fileId ?? null) as string | null;
					})
					.filter((s): s is string => s !== null);
				return { results, sources, total: data?.total ?? results.length };
			} catch {
				return { results: [], sources: [], total: 0 };
			}
		} catch {
			return { results: [], sources: [], total: 0 };
		}
	},
});

// ─── Step 5: generate-validate-execute-sql ────────────────────────────────────

const generateValidateExecuteSqlStep = createStep({
	id: "generate-validate-execute-sql",
	inputSchema: z.object({
		"search-doctor-notes": ragOutputSchema,
		"search-documents": ragOutputSchema,
	}),
	outputSchema: z.object({
		sql: z.string().optional(),
		validationResult: z.string().optional(),
		rows: z.array(z.unknown()),
		executionSuccess: z.boolean(),
		executionError: z.string().optional(),
		doctorNotesResults: z.array(z.unknown()),
		documentsResults: z.array(z.unknown()),
		doctorNotesSources: z.array(z.string()),
		documentsSources: z.array(z.string()),
	}),
	execute: async ({ inputData, getStepResult }) => {
		try {
			const parallelNotes = inputData["search-doctor-notes"];
			const parallelDocs = inputData["search-documents"];

			const passthrough = {
				doctorNotesResults: parallelNotes.results,
				documentsResults: parallelDocs.results,
				doctorNotesSources: parallelNotes.sources,
				documentsSources: parallelDocs.sources,
			};

			const step3 = getStepResult(refineSqlStatementStep);

			if (step3.queryType === "RAG_DOCS" || step3.queryType === "RAG_NOTES") {
				return { ...passthrough, rows: [], executionSuccess: false };
			}

			try {
				const genPrompt = `SQL Intent: ${step3.refinedSqlIntent ?? step3.originalQuestion}
Schema Context:\n${step3.schemaContext ?? ""}
Original Question: ${step3.originalQuestion}

Generate a single PostgreSQL SELECT query. Output ONLY SQL.`;

				const { text: rawSql } = await sqlGenerationAgent.generate([{ role: "user", content: genPrompt }]);
				const generatedSql = rawSql
					.replace(/^```(?:sql)?\s*\r?\n?/im, "")
					.replace(/\r?\n?```\s*$/im, "")
					.trim();

				const valPrompt = `Schema Context:\n${step3.schemaContext ?? ""}

SQL Query:\n${generatedSql}

Validate. Return "VALID" or "INVALID: <reason>".`;
				const { text: validationResult } = await sqlValidationAgent.generate([{ role: "user", content: valPrompt }]);
				const isValid = validationResult.trim().toUpperCase().startsWith("VALID");

				if (!isValid) {
					return {
						...passthrough,
						sql: generatedSql,
						validationResult: validationResult.trim(),
						rows: [],
						executionSuccess: false,
						executionError: `SQL validation failed: ${validationResult.trim()}`,
					};
				}

				const data = await requestAgentApi<{ rows?: unknown[] }>({
					method: "POST",
					path: "/agent/sql/query",
					body: { sql: generatedSql, limit: step3.limit ?? 50 },
					baseUrl: step3.baseUrl,
				});
				const rows = Array.isArray(data?.rows) ? data.rows : [];

				return { ...passthrough, sql: generatedSql, validationResult: validationResult.trim(), rows, executionSuccess: true };
			} catch (error) {
				return {
					...passthrough,
					rows: [],
					executionSuccess: false,
					executionError: errorMessageFromUnknown(error),
				};
			}
		} catch (error) {
			const notes = inputData["search-doctor-notes"];
			const docs = inputData["search-documents"];
			return {
				doctorNotesResults: notes?.results ?? [],
				documentsResults: docs?.results ?? [],
				doctorNotesSources: notes?.sources ?? [],
				documentsSources: docs?.sources ?? [],
				rows: [],
				executionSuccess: false,
				executionError: errorMessageFromUnknown(error),
			};
		}
	},
});

// ─── Step 6: synthesize-all-results ──────────────────────────────────────────

const synthesizeAllResultsStep = createStep({
	id: "synthesize-all-results",
	inputSchema: z.object({
		sql: z.string().optional(),
		validationResult: z.string().optional(),
		rows: z.array(z.unknown()),
		executionSuccess: z.boolean(),
		executionError: z.string().optional(),
		doctorNotesResults: z.array(z.unknown()),
		documentsResults: z.array(z.unknown()),
		doctorNotesSources: z.array(z.string()),
		documentsSources: z.array(z.string()),
	}),
	outputSchema: z.object({
		synthesizedResponse: z.string(),
		sources: z.array(z.string()),
		searchSuccess: z.boolean(),
		sql: z.string().optional(),
		rows: z.array(z.unknown()),
		queryType: z.string(),
	}),
	execute: async ({ inputData, getStepResult }) => {
		const { rows, executionSuccess, sql, doctorNotesResults, documentsResults, doctorNotesSources, documentsSources } =
			inputData;

		try {
			const step2 = getStepResult(classifyAndRefineQueryStep);

			const allSources = [...doctorNotesSources, ...documentsSources];
			const hasContent =
				doctorNotesResults.length > 0 || documentsResults.length > 0 || (executionSuccess && rows.length > 0);

			if (!hasContent) {
				return {
					synthesizedResponse: "No relevant clinical information was found for this query.",
					sources: [],
					searchSuccess: false,
					sql,
					rows,
					queryType: step2.queryType,
				};
			}

			const formatResults = (items: unknown[]) =>
				items
					.slice(0, 10)
					.map((r) => {
						const p = (r as Record<string, unknown>)?.payload as Record<string, unknown> | undefined;
						const text = p?.text ?? p?.noteText ?? (r as Record<string, unknown>)?.chunk;
						return typeof text === "string" ? text.slice(0, 500) : JSON.stringify(r).slice(0, 500);
					})
					.join("\n---\n");

			const prompt = `Clinical Question: "${step2.originalQuestion}"

Doctor Notes (${doctorNotesResults.length} results):
${doctorNotesResults.length > 0 ? formatResults(doctorNotesResults) : "(none)"}

Documents (${documentsResults.length} results):
${documentsResults.length > 0 ? formatResults(documentsResults) : "(none)"}
${executionSuccess && rows.length > 0 ? `\nStructured Database Results (${rows.length} rows):\n${JSON.stringify(rows.slice(0, 20), null, 2)}` : ""}

Synthesize a comprehensive clinical answer. Cite sources. If SQL data conflicts with notes, prefer the most recent; flag the discrepancy. Never fabricate facts.`;

			const { text } = await clinicalSynthesisAgent.generate([{ role: "user", content: prompt }]);

			return {
				synthesizedResponse: text.trim(),
				sources: allSources,
				searchSuccess: true,
				sql,
				rows,
				queryType: step2.queryType,
			};
		} catch (error) {
			let queryType = "UNKNOWN";
			try {
				queryType = getStepResult(classifyAndRefineQueryStep).queryType;
			} catch {
				// keep UNKNOWN
			}
			const fallbackSources = [...doctorNotesSources, ...documentsSources];
			return {
				synthesizedResponse: `Result synthesis failed: ${errorMessageFromUnknown(error)}`,
				sources: fallbackSources,
				searchSuccess: false,
				sql,
				rows,
				queryType,
			};
		}
	},
});

// ─── Workflow assembly ────────────────────────────────────────────────────────

export const clinicalQueryWorkflow = createWorkflow({
	id: "clinical-query-workflow",
	description: "Classify intent, refine query and SQL statement, search RAG in parallel, execute SQL, synthesize",
	inputSchema: z.object({
		question: z.string().min(1),
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int().min(1).max(200).optional(),
	}),
	outputSchema: z.object({
		synthesizedResponse: z.string(),
		sources: z.array(z.string()),
		searchSuccess: z.boolean(),
		sql: z.string().optional(),
		rows: z.array(z.unknown()),
		queryType: z.string(),
	}),
})
	.then(acceptQueryStep)
	.then(classifyAndRefineQueryStep)
	.then(refineSqlStatementStep)
	.parallel([searchDoctorNotesStep, searchDocumentsStep])
	.then(generateValidateExecuteSqlStep)
	.then(synthesizeAllResultsStep)
	.commit();
