import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { requestAgentApi } from "./agentApiClient";
import { structuredAgentApiToolOutputSchema, structuredToolError } from "./toolResultUtils";

const paginationTake = z.number().int().min(1).max(200).optional();
const paginationSkip = z.number().int().min(0).optional();

export const listPatientsByMrnOrName = createTool({
	id: "list_patientsByMrn",
	description:
		"Look up patients by name (fuzzy search) or by MRN. Returns { success, data } on success or { success: false, error } on failure.",
	inputSchema: z.object({
		query: z.string().min(1).describe("Patient MRN"),
		take: paginationTake,
		skip: paginationSkip,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: structuredAgentApiToolOutputSchema,
	execute: async (input) => {
		try {
			const data = await requestAgentApi({
				method: "GET",
				path: `/agent/patients/by-mrn/${encodeURIComponent(input.query)}`,
				baseUrl: input.baseUrl,
			});
			return { success: true as const, data };
		} catch (error) {
			return { success: false as const, error: structuredToolError(error) };
		}
	},
});

export const getSchemaTool = createTool({
	id: "getSchema",
	description: "Get full SQL schema: tables, columns, relations, and enums. Returns { success, data } or { success: false, error }.",
	inputSchema: z.object({ baseUrl: z.string().url().optional() }),
	outputSchema: structuredAgentApiToolOutputSchema,
	execute: async (input) => {
		try {
			const data = await requestAgentApi({ method: "GET", path: "/agent/sql/schema", baseUrl: input.baseUrl });
			return { success: true as const, data };
		} catch (error) {
			return { success: false as const, error: structuredToolError(error) };
		}
	},
});

const ragLimit = z.number().int().min(1).max(200).optional();

export const searchDoctorNotesTool = createTool({
	id: "search_doctor_notes",
	description:
		"Semantic search across doctor notes (RAG). Inputs: query (required), optional patientId, encounterId, limit (1-200). On success, data contains { results, total }; each result has a payload with noteId/id usable as a citation source. Returns { success, data } or { success: false, error }.",
	inputSchema: z.object({
		query: z.string().min(1).describe("Natural-language search query"),
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		limit: ragLimit,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: structuredAgentApiToolOutputSchema,
	execute: async (input) => {
		try {
			const data = await requestAgentApi({
				method: "POST",
				path: "/agent/rag/search-doctor-notes",
				body: {
					query: input.query,
					patientId: input.patientId,
					encounterId: input.encounterId,
					limit: input.limit,
				},
				baseUrl: input.baseUrl,
			});
			return { success: true as const, data };
		} catch (error) {
			return { success: false as const, error: structuredToolError(error) };
		}
	},
});

export const searchDocumentsTool = createTool({
	id: "search_documents",
	description:
		"Semantic search across clinical documents (RAG). Inputs: query (required), optional patientId, limit (1-200). On success, data contains { results, total }; each result has a payload with filename/originalName/fileId usable as a citation source. Returns { success, data } or { success: false, error }.",
	inputSchema: z.object({
		query: z.string().min(1).describe("Natural-language search query"),
		patientId: z.string().optional(),
		limit: ragLimit,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: structuredAgentApiToolOutputSchema,
	execute: async (input) => {
		try {
			const data = await requestAgentApi({
				method: "POST",
				path: "/agent/rag/search-documents",
				body: {
					query: input.query,
					patientId: input.patientId,
					limit: input.limit,
				},
				baseUrl: input.baseUrl,
			});
			return { success: true as const, data };
		} catch (error) {
			return { success: false as const, error: structuredToolError(error) };
		}
	},
});

export const runSqlQueryTool = createTool({
	id: "run_sql_query",
	description:
		"Execute a read-only SELECT SQL query against the clinical database. Inputs: sql (required, SELECT-only — backend rejects anything else), optional limit (1-200). On success, data contains the executed rows. ALWAYS call getSchema first to learn the tables/columns, and use list_patientsByMrn to resolve a patientId rather than guessing. Returns { success, data } or { success: false, error }.",
	inputSchema: z.object({
		sql: z.string().min(1).describe("A single SELECT statement"),
		limit: ragLimit,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: structuredAgentApiToolOutputSchema,
	execute: async (input) => {
		try {
			const data = await requestAgentApi({
				method: "POST",
				path: "/agent/sql/query",
				body: { sql: input.sql, limit: input.limit },
				baseUrl: input.baseUrl,
			});
			return { success: true as const, data };
		} catch (error) {
			return { success: false as const, error: structuredToolError(error) };
		}
	},
});
