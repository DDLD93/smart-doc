import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { requestAgentApi } from "./agentApiClient";

export async function retrieveTopK(
    question: string,
    options?: {
        topK?: number;
        collection?: "documents" | "doctor_notes";
        filter?: unknown;
        patientId?: string;
        fileId?: string;
        encounterId?: string;
        baseUrl?: string;
    }
) {
    const collection = options?.collection ?? "documents";
    const path = collection === "doctor_notes" ? "/agent/rag/search-doctor-notes" : "/agent/rag/search-documents";

    const raw = await requestAgentApi<{ results?: Array<{ payload?: Record<string, unknown> }> }>({
        method: "POST",
        path,
        body: {
            query: question,
            limit: options?.topK,
            filter: options?.filter,
            patientId: options?.patientId,
            fileId: options?.fileId,
            encounterId: options?.encounterId,
        },
        baseUrl: options?.baseUrl,
    });

    const normalized = (raw.results ?? []).map((item) => {
        const payload = item.payload ?? {};
        const fileId = (payload.fileId as string | number | undefined) ?? "";
        const filename = payload.filename as string | undefined;
        const originalName = payload.originalName as string | undefined;
        const page = typeof payload.page === "number" ? payload.page : undefined;
        const chunkRaw = payload.text ?? payload.noteText ?? "";
        const chunk = typeof chunkRaw === "string" ? chunkRaw : String(chunkRaw);
        return { fileId, filename, originalName, chunk, page, payload };
    });

    return { results: normalized };
}

export const ragRetrieverTool = createTool({
	id: "qdrant-rag-retriever",
	description: "Backward-compatible retriever that now uses /agent/rag/search-documents.",
    inputSchema: z.object({
        question: z.string().describe("Natural language query to search for"),
        topK: z.number().optional().describe("Number of results to retrieve (default 5)"),
        collection: z.enum(["documents", "doctor_notes"]).optional().describe("Target collection (default: documents)"),
        patientId: z.string().optional(),
        fileId: z.string().optional(),
        encounterId: z.string().optional(),
        filter: z.record(z.unknown()).optional().describe("Optional metadata filter for search"),
        baseUrl: z.string().url().optional(),
    }),
    outputSchema: z.object({
        results: z.array(
            z.object({
                fileId: z.union([z.string(), z.number()]),
                filename: z.string().optional(),
                originalName: z.string().optional(),
                chunk: z.string(),
                page: z.number().optional(),
                payload: z.unknown().optional(),
            })
        ),
    }),
    execute: async (inputData, _context) => {
        const { question, topK, collection, filter, patientId, fileId, encounterId, baseUrl } = inputData;
        return await retrieveTopK(question, { topK, collection, filter, patientId, fileId, encounterId, baseUrl });
    },
});


