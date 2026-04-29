import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type RagSearchResult = {
    id: number | string;
    version?: number;
    score?: number;
    payload?: Record<string, unknown>;
};

type RagSearchResponse = {
    results: RagSearchResult[];
};

export const ragHttpSearchTool = createTool({
    id: "rag-http-search",
    description: "Call external RAG fileserver to perform vector search and return raw results.",
    inputSchema: z.object({
        query: z.string().describe("Natural language query"),
        limit: z.number().optional().describe("Number of results to retrieve"),
        filter: z.any().optional().describe("Optional Qdrant filter object"),
        baseUrl: z
            .string()
            .optional()
            .describe("Base URL of fileserver (defaults to http://localhost:3000)"),
    }),
    outputSchema: z.object({
        results: z.array(z.any()),
    }),
    execute: async (inputData, _context) => {
        const { query, limit, filter, baseUrl } = inputData;

        const resolvedBaseUrl = baseUrl || process.env.FILESERVER_BASE_URL || "http://localhost:3000";
        const url = `${resolvedBaseUrl.replace(/\/$/, "")}/rag/search`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit, filter }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`RAG HTTP search failed: ${response.status} ${response.statusText} ${text}`);
        }

        const data = (await response.json()) as RagSearchResponse;
        return { results: data?.results ?? [] };
    },
});


