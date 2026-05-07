import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { requestAgentApi } from "./agentApiClient";

export const ragHttpSearchTool = createTool({
    id: "rag-http-search",
    description: "Backward-compatible HTTP RAG search against /agent/rag/search-documents.",
    inputSchema: z.object({
        query: z.string().describe("Natural language query"),
        limit: z.number().int().min(1).max(50).optional().describe("Number of results to retrieve"),
        patientId: z.string().optional().describe("Optional patient filter"),
        fileId: z.string().optional().describe("Optional file filter"),
        filter: z.record(z.unknown()).optional().describe("Optional Qdrant filter object"),
        baseUrl: z
            .string()
            .optional()
            .describe("Base URL of fileserver (defaults to http://localhost:3000)"),
    }),
    outputSchema: z.object({
        results: z.array(z.unknown()),
    }),
    execute: async (inputData, _context) => {
        const { query, limit, filter, baseUrl, patientId, fileId } = inputData;
        const data = await requestAgentApi<{ results?: unknown[] }>({
            method: "POST",
            path: "/agent/rag/search-documents",
            body: { query, limit, patientId, fileId, filter },
            baseUrl,
        });
        return { results: data?.results ?? [] };
    },
});


