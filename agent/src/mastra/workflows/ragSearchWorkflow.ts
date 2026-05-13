import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { requestAgentApi } from "../tools/agentApiClient";
import { errorMessageFromUnknown } from "../tools/toolResultUtils";

const queryTypeSchema = z.enum(["RAG_DOCS", "RAG_NOTES", "SQL", "BOTH"]);

const ragResultSchema = z.object({
	results: z.array(z.unknown()),
	sources: z.array(z.string()),
	total: z.number(),
});

// ─── Step 1: accept-rag-query ─────────────────────────────────────────────────

const acceptRagQueryStep = createStep({
	id: "rag-accept-query",
	inputSchema: z.object({
		query: z.string().min(1),
		queryType: queryTypeSchema,
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int().optional(),
	}),
	outputSchema: z.object({
		query: z.string(),
		queryType: queryTypeSchema,
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	execute: async ({ inputData }) => {
		try {
			return {
				query: inputData.query.trim(),
				queryType: inputData.queryType,
				patientId: inputData.patientId,
				encounterId: inputData.encounterId,
				baseUrl: inputData.baseUrl,
				limit: inputData.limit ?? 10,
			};
		} catch (error) {
			return {
				query: (inputData.query ?? "").trim() || `Accept RAG query failed: ${errorMessageFromUnknown(error)}`,
				queryType: inputData.queryType ?? "BOTH",
				patientId: inputData.patientId,
				encounterId: inputData.encounterId,
				baseUrl: inputData.baseUrl,
				limit: inputData.limit ?? 10,
			};
		}
	},
});

// ─── Step 2a: rag-search-notes (parallel branch) ─────────────────────────────

const searchNotesStep = createStep({
	id: "rag-search-notes",
	inputSchema: z.object({
		query: z.string(),
		queryType: queryTypeSchema,
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	outputSchema: ragResultSchema,
	execute: async ({ inputData }) => {
		try {
			const { query, queryType, patientId, encounterId, baseUrl, limit } = inputData;

			if (queryType === "RAG_DOCS") return { results: [], sources: [], total: 0 };

			try {
				const data = await requestAgentApi<{ results?: unknown[]; total?: number }>({
					method: "POST",
					path: "/agent/rag/search-doctor-notes",
					body: { query, patientId, encounterId, limit },
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

// ─── Step 2b: rag-search-documents (parallel branch) ─────────────────────────

const searchDocumentsStep = createStep({
	id: "rag-search-documents",
	inputSchema: z.object({
		query: z.string(),
		queryType: queryTypeSchema,
		patientId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int(),
	}),
	outputSchema: ragResultSchema,
	execute: async ({ inputData }) => {
		try {
			const { query, queryType, patientId, baseUrl, limit } = inputData;

			if (queryType === "RAG_NOTES") return { results: [], sources: [], total: 0 };

			try {
				const data = await requestAgentApi<{ results?: unknown[]; total?: number }>({
					method: "POST",
					path: "/agent/rag/search-documents",
					body: { query, patientId, limit },
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

// ─── Step 3: rag-merge-results ────────────────────────────────────────────────

const mergeRagResultsStep = createStep({
	id: "rag-merge-results",
	inputSchema: z.object({
		"rag-search-notes": ragResultSchema,
		"rag-search-documents": ragResultSchema,
	}),
	outputSchema: z.object({
		doctorNotesResults: z.array(z.unknown()),
		doctorNotesSources: z.array(z.string()),
		documentsResults: z.array(z.unknown()),
		documentsSources: z.array(z.string()),
		totalNotes: z.number(),
		totalDocs: z.number(),
	}),
	execute: async ({ inputData }) => {
		try {
			const notes = inputData["rag-search-notes"];
			const docs = inputData["rag-search-documents"];
			return {
				doctorNotesResults: notes.results,
				doctorNotesSources: notes.sources,
				documentsResults: docs.results,
				documentsSources: docs.sources,
				totalNotes: notes.total,
				totalDocs: docs.total,
			};
		} catch {
			return {
				doctorNotesResults: [],
				doctorNotesSources: [],
				documentsResults: [],
				documentsSources: [],
				totalNotes: 0,
				totalDocs: 0,
			};
		}
	},
});

// ─── Workflow assembly ────────────────────────────────────────────────────────

export const ragSearchWorkflow = createWorkflow({
	id: "rag-search-workflow",
	description: "Parallel semantic search across doctor notes and clinical documents",
	inputSchema: z.object({
		query: z.string().min(1),
		queryType: queryTypeSchema,
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().int().min(1).max(200).optional(),
	}),
	outputSchema: z.object({
		doctorNotesResults: z.array(z.unknown()),
		doctorNotesSources: z.array(z.string()),
		documentsResults: z.array(z.unknown()),
		documentsSources: z.array(z.string()),
		totalNotes: z.number(),
		totalDocs: z.number(),
	}),
})
	.then(acceptRagQueryStep)
	.parallel([searchNotesStep, searchDocumentsStep])
	.then(mergeRagResultsStep)
	.commit();
