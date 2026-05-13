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

const queryPlanSchema = z.object({
	originalQuestion: z.string(),
	searchQuery: z.string(),
	queryType: queryTypeSchema,
	sqlIntent: z.string().optional(),
	schemaContext: z.string().optional(),
	patientId: z.string().optional(),
	encounterId: z.string().optional(),
	baseUrl: z.string().optional(),
	limit: z.number().int(),
});

const parallelStepInputSchema = z.object({
	searchQuery: z.string(),
	queryType: queryTypeSchema,
	patientId: z.string().optional(),
	encounterId: z.string().optional(),
	baseUrl: z.string().optional(),
	limit: z.number().int(),
});

const ragOutputSchema = z.object({
	results: z.array(z.unknown()),
	sources: z.array(z.string()),
	total: z.number().optional(),
});

const parallelResultsSchema = z.object({
	"search-doctor-notes": ragOutputSchema,
	"search-documents": ragOutputSchema,
});

const clinicalContextSchema = z.object({
	doctorNotes: ragOutputSchema,
	documents: ragOutputSchema,
	sql: z.string().optional(),
	validationResult: z.string().optional(),
	rows: z.array(z.unknown()),
	executionSuccess: z.boolean(),
	executionError: z.string().optional(),
});

type RagOutput = z.infer<typeof ragOutputSchema>;
type ClinicalContext = z.infer<typeof clinicalContextSchema>;

// ─── Sub-agents ──────────────────────────────────────────────────────────────

const queryClassifierAgent = new Agent({
	id: "query-classifier-agent",
	name: "query-classifier-agent",
	description: "Classifies clinical questions and refines them for semantic search",
	instructions: `Classify a clinical question and prepare it for retrieval.

Choose exactly one queryType:
- RAG_DOCS: uploaded clinical documents such as reports, discharge summaries, lab PDFs, referrals, letters.
- RAG_NOTES: doctor notes, progress notes, encounter notes, clinical observations.
- SQL: structured database facts such as counts, dates, values, statuses, demographics, medications, appointments, or aggregates.
- BOTH: needs narrative evidence plus structured data.

Return a refinedQuery for semantic search: concise, clinically specific, no filler, expanded abbreviations when clear.
Return sqlHint only for SQL or BOTH; otherwise null.

Output JSON only:
{"queryType":"RAG_DOCS|RAG_NOTES|SQL|BOTH","refinedQuery":"...","sqlHint":"... or null"}`,
	model: "openrouter/google/gemini-2.5-flash",
});

const sqlStatementRefinementAgent = new Agent({
	id: "sql-statement-refinement-agent",
	name: "sql-statement-refinement-agent",
	description: "Refines SQL intent given the database schema",
	instructions: `Convert a clinical question into a precise SQL intent using only the provided schema.

Identify the relevant tables, columns, joins, filters, ordering, grouping, and aggregations.
Preserve patientId and encounterId constraints when present.
Do not invent tables or columns. Do not write SQL.
Keep schemaContext to the minimum schema excerpt needed for SQL generation.

Output JSON only:
{"refinedSqlIntent":"...","relevantTables":["..."],"schemaContext":"..."}`,
	model: "openrouter/google/gemini-2.5-flash",
});

const sqlGenerationAgent = new Agent({
	id: "clinical-sql-generation-agent",
	name: "clinical-sql-generation-agent",
	description: "Generates a PostgreSQL query from a refined SQL intent",
	instructions: `Generate one safe PostgreSQL read query from the SQL intent and schema context.

Rules:
- Output SQL only. No markdown, prose, or comments.
- Use only SELECT or WITH ... SELECT.
- Use only tables and columns present in schemaContext.
- Include patientId, encounterId, and other filters described in the intent.
- Qualify ambiguous columns with table aliases.
- Add a LIMIT when the query can return multiple rows.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, or EXECUTE.`,
	model: "openrouter/qwen/qwen3-coder-next",
});

const sqlValidationAgent = new Agent({
	id: "clinical-sql-validation-agent",
	name: "clinical-sql-validation-agent",
	description: "Validates SQL queries for correctness and safety",
	instructions: `Validate a PostgreSQL query before execution.

Return exactly one line:
- VALID
- INVALID: <specific reason>

Reject any query that:
- is not a single SELECT or WITH ... SELECT statement
- references tables or columns not shown in the schema context
- performs writes, DDL, permissions changes, procedure calls, or dynamic execution
- lacks required patientId or encounterId filters from the intent
- has obvious PostgreSQL syntax errors
- can return many rows without a LIMIT`,
	model: "openrouter/deepseek/deepseek-r1",
});

const clinicalSynthesisAgent = new Agent({
	id: "clinical-synthesis-agent",
	name: "clinical-synthesis-agent",
	description: "Synthesizes RAG results and SQL rows into a coherent clinical answer",
	instructions: `Synthesize clinical evidence into a concise answer.

Use only the provided doctor notes, documents, and SQL rows.
Start with the direct answer, then summarize supporting evidence.
Cite filenames, note IDs, record IDs, or row identifiers when available.
If evidence conflicts, prefer the most recent dated source and mention the conflict.
If evidence is insufficient, say what is missing.
Do not provide diagnosis or treatment advice beyond the source evidence.`,
	model: "openrouter/google/gemini-2.5-pro",
});

const emptyRagResult = (): RagOutput => ({ results: [], sources: [], total: 0 });

const parseJsonOrFallback = <T>(text: string, fallback: T): T => {
	try {
		return JSON.parse(text.trim()) as T;
	} catch {
		return fallback;
	}
};

const stripSqlFence = (sql: string) =>
	sql
		.replace(/^```(?:sql)?\s*\r?\n?/im, "")
		.replace(/\r?\n?```\s*$/im, "")
		.trim();

const extractSources = (results: unknown[], keys: string[]) =>
	results
		.map((result) => {
			const payload = (result as Record<string, unknown>)?.payload as Record<string, unknown> | undefined;
			const source = keys.map((key) => payload?.[key]).find((value) => typeof value === "string");
			return source as string | undefined;
		})
		.filter((source): source is string => Boolean(source));

const formatResults = (items: unknown[]) =>
	items
		.slice(0, 10)
		.map((result) => {
			const payload = (result as Record<string, unknown>)?.payload as Record<string, unknown> | undefined;
			const text = payload?.text ?? payload?.noteText ?? (result as Record<string, unknown>)?.chunk;
			return typeof text === "string" ? text.slice(0, 500) : JSON.stringify(result).slice(0, 500);
		})
		.join("\n---\n");

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

// ─── Step 2: plan-query ───────────────────────────────────────────────────────

const planQueryStep = createStep({
	id: "plan-query",
	inputSchema: z.object({
		question: z.string(),
		...metaFields,
		limit: z.number().int(),
	}),
	outputSchema: queryPlanSchema,
	execute: async ({ inputData }) => {
		const { question, patientId, encounterId, baseUrl, limit } = inputData;

		try {
			const prompt = `Classify and refine this clinical question for a patient record system.
Question: "${question}"${patientId ? `\nPatient context: patientId=${patientId}` : ""}${encounterId ? `\nEncounter context: encounterId=${encounterId}` : ""}`;

			const { text } = await queryClassifierAgent.generate([{ role: "user", content: prompt }]);

			const parsed = parseJsonOrFallback<{ queryType?: string; refinedQuery?: string; sqlHint?: string | null }>(text, {
				queryType: "BOTH",
				refinedQuery: question,
				sqlHint: null,
			});
			const parsedType = queryTypeSchema.safeParse(parsed.queryType);
			const queryType = (parsedType.success ? parsedType.data : "BOTH") as QueryType;
			const searchQuery = parsed.refinedQuery ?? question;

			if (queryType === "RAG_DOCS" || queryType === "RAG_NOTES") {
				return {
					originalQuestion: question,
					searchQuery,
					queryType,
					patientId,
					encounterId,
					baseUrl,
					limit,
				};
			}

			let schemaJson = "{}";
			try {
				const schemaPayload = await requestAgentApi<unknown>({ method: "GET", path: "/agent/sql/schema", baseUrl });
				schemaJson = JSON.stringify(schemaPayload, null, 2);
			} catch {
				// Continue with an empty schema so the SQL step can fail gracefully.
			}

			const sqlPrompt = `Database Schema:\n${schemaJson}\n\nOriginal clinical question: "${question}"${parsed.sqlHint ? `\nSQL hint: ${parsed.sqlHint}` : ""}${patientId ? `\nFilter context: patientId = ${patientId}` : ""}${encounterId ? `\nFilter context: encounterId = ${encounterId}` : ""}\n\nProduce a precise SQL intent description.`;
			const { text: sqlText } = await sqlStatementRefinementAgent.generate([{ role: "user", content: sqlPrompt }]);
			const sqlPlan = parseJsonOrFallback<{ refinedSqlIntent?: string; schemaContext?: string }>(sqlText, {
				refinedSqlIntent: sqlText.trim(),
				schemaContext: schemaJson.slice(0, 2000),
			});

			return {
				originalQuestion: question,
				searchQuery,
				queryType,
				sqlIntent: sqlPlan.refinedSqlIntent ?? parsed.sqlHint ?? question,
				schemaContext: sqlPlan.schemaContext ?? schemaJson.slice(0, 2000),
				patientId,
				encounterId,
				baseUrl,
				limit,
			};
		} catch (error) {
			return {
				originalQuestion: question,
				searchQuery: question,
				queryType: "BOTH" as QueryType,
				sqlIntent: `Query planning failed: ${errorMessageFromUnknown(error)}`,
				schemaContext: "{}",
				patientId,
				encounterId,
				baseUrl,
				limit,
			};
		}
	},
});

// ─── Step 3: prepare-rag-search ───────────────────────────────────────────────

const prepareRagSearchStep = createStep({
	id: "prepare-rag-search",
	inputSchema: queryPlanSchema,
	outputSchema: parallelStepInputSchema,
	execute: async ({ inputData }) => ({
		searchQuery: inputData.searchQuery,
		queryType: inputData.queryType,
		patientId: inputData.patientId,
		encounterId: inputData.encounterId,
		baseUrl: inputData.baseUrl,
		limit: inputData.limit,
	}),
});

// ─── Step 4a: search-doctor-notes (parallel branch) ──────────────────────────

const searchDoctorNotesStep = createStep({
	id: "search-doctor-notes",
	inputSchema: parallelStepInputSchema,
	outputSchema: ragOutputSchema,
	execute: async ({ inputData }) => {
		try {
			const { searchQuery, queryType, patientId, encounterId, baseUrl, limit } = inputData;

			if (queryType === "RAG_DOCS") return emptyRagResult();

			try {
				const data = await requestAgentApi<{ results?: unknown[]; total?: number }>({
					method: "POST",
					path: "/agent/rag/search-doctor-notes",
					body: { query: searchQuery, patientId, encounterId, limit },
					baseUrl,
				});
				const results = Array.isArray(data?.results) ? data.results : [];
				const sources = extractSources(results, ["noteId", "id"]);
				return { results, sources, total: data?.total ?? results.length };
			} catch {
				return emptyRagResult();
			}
		} catch {
			return emptyRagResult();
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
			const { searchQuery, queryType, patientId, baseUrl, limit } = inputData;

			if (queryType === "RAG_NOTES") return emptyRagResult();

			try {
				const data = await requestAgentApi<{ results?: unknown[]; total?: number }>({
					method: "POST",
					path: "/agent/rag/search-documents",
					body: { query: searchQuery, patientId, limit },
					baseUrl,
				});
				const results = Array.isArray(data?.results) ? data.results : [];
				const sources = extractSources(results, ["filename", "originalName", "fileId"]);
				return { results, sources, total: data?.total ?? results.length };
			} catch {
				return emptyRagResult();
			}
		} catch {
			return emptyRagResult();
		}
	},
});

// ─── Step 5: run-sql-if-needed ────────────────────────────────────────────────

const runSqlIfNeededStep = createStep({
	id: "run-sql-if-needed",
	inputSchema: parallelResultsSchema,
	outputSchema: clinicalContextSchema,
	execute: async ({ inputData, getStepResult }) => {
		const queryPlan = getStepResult(planQueryStep);
		const context: ClinicalContext = {
			doctorNotes: inputData["search-doctor-notes"],
			documents: inputData["search-documents"],
			rows: [],
			executionSuccess: false,
		};

		if (queryPlan.queryType === "RAG_DOCS" || queryPlan.queryType === "RAG_NOTES") {
			return context;
		}

		try {
			const genPrompt = `SQL Intent: ${queryPlan.sqlIntent ?? queryPlan.originalQuestion}
Schema Context:\n${queryPlan.schemaContext ?? ""}
Original Question: ${queryPlan.originalQuestion}

Generate a single PostgreSQL SELECT query. Output ONLY SQL.`;

			const { text: rawSql } = await sqlGenerationAgent.generate([{ role: "user", content: genPrompt }]);
			const generatedSql = stripSqlFence(rawSql);

			const valPrompt = `SQL Intent: ${queryPlan.sqlIntent ?? queryPlan.originalQuestion}
Schema Context:\n${queryPlan.schemaContext ?? ""}

SQL Query:\n${generatedSql}

Validate. Return "VALID" or "INVALID: <reason>".`;
			const { text: validationResult } = await sqlValidationAgent.generate([{ role: "user", content: valPrompt }]);
			const cleanValidation = validationResult.trim();

			if (!cleanValidation.toUpperCase().startsWith("VALID")) {
				return {
					...context,
					sql: generatedSql,
					validationResult: cleanValidation,
					executionError: `SQL validation failed: ${cleanValidation}`,
				};
			}

			const data = await requestAgentApi<{ rows?: unknown[] }>({
				method: "POST",
				path: "/agent/sql/query",
				body: { sql: generatedSql, limit: queryPlan.limit },
				baseUrl: queryPlan.baseUrl,
			});

			return {
				...context,
				sql: generatedSql,
				validationResult: cleanValidation,
				rows: Array.isArray(data?.rows) ? data.rows : [],
				executionSuccess: true,
			};
		} catch (error) {
			return {
				...context,
				executionError: errorMessageFromUnknown(error),
			};
		}
	},
});

// ─── Step 6: synthesize-answer ────────────────────────────────────────────────

const synthesizeAnswerStep = createStep({
	id: "synthesize-answer",
	inputSchema: clinicalContextSchema,
	outputSchema: z.object({
		synthesizedResponse: z.string(),
		sources: z.array(z.string()),
		searchSuccess: z.boolean(),
		sql: z.string().optional(),
		rows: z.array(z.unknown()),
		queryType: z.string(),
	}),
	execute: async ({ inputData, getStepResult }) => {
		const { rows, executionSuccess, sql, doctorNotes, documents } = inputData;
		const queryPlan = getStepResult(planQueryStep);

		try {
			const allSources = [...doctorNotes.sources, ...documents.sources];
			const hasContent =
				doctorNotes.results.length > 0 || documents.results.length > 0 || (executionSuccess && rows.length > 0);

			if (!hasContent) {
				return {
					synthesizedResponse: "No relevant clinical information was found for this query.",
					sources: [],
					searchSuccess: false,
					sql,
					rows,
					queryType: queryPlan.queryType,
				};
			}

			const prompt = `Clinical Question: "${queryPlan.originalQuestion}"

Doctor Notes (${doctorNotes.results.length} results):
${doctorNotes.results.length > 0 ? formatResults(doctorNotes.results) : "(none)"}

Documents (${documents.results.length} results):
${documents.results.length > 0 ? formatResults(documents.results) : "(none)"}
${executionSuccess && rows.length > 0 ? `\nStructured Database Results (${rows.length} rows):\n${JSON.stringify(rows.slice(0, 20), null, 2)}` : ""}

Synthesize a comprehensive clinical answer. Cite sources. If SQL data conflicts with notes, prefer the most recent; flag the discrepancy. Never fabricate facts.`;

			const { text } = await clinicalSynthesisAgent.generate([{ role: "user", content: prompt }]);

			return {
				synthesizedResponse: text.trim(),
				sources: allSources,
				searchSuccess: true,
				sql,
				rows,
				queryType: queryPlan.queryType,
			};
		} catch (error) {
			const fallbackSources = [...doctorNotes.sources, ...documents.sources];
			return {
				synthesizedResponse: `Result synthesis failed: ${errorMessageFromUnknown(error)}`,
				sources: fallbackSources,
				searchSuccess: false,
				sql,
				rows,
				queryType: queryPlan.queryType,
			};
		}
	},
});

// ─── Workflow assembly ────────────────────────────────────────────────────────

export const clinicalQueryWorkflow = createWorkflow({
	id: "clinical-query-workflow",
	description: "Plan clinical query, search RAG in parallel, optionally run SQL, then synthesize",
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
	.then(planQueryStep)
	.then(prepareRagSearchStep)
	.parallel([searchDoctorNotesStep, searchDocumentsStep])
	.then(runSqlIfNeededStep)
	.then(synthesizeAnswerStep)
	.commit();
