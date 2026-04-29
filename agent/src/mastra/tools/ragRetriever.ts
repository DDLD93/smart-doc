import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { QdrantVector } from '@mastra/qdrant'
 
const qdrantUrl = process.env.QDRANT_URL;
const qdrantApiKey = process.env.QDRANT_API_KEY || "";

let store: QdrantVector | null = null;
let indexReady = false;

async function getStore() {
  if (!qdrantUrl) {
    throw new Error("QDRANT_URL environment variable is required");
  }

  if (!store) {
    store = new QdrantVector({
      id: "rag-retriever-store",
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });
  }

  if (!indexReady) {
    await store.createIndex({
      indexName: "documents",
      dimension: 3072,
    });
    indexReady = true;
  }

  return store;
}

export async function retrieveTopK(
    question: string,
    options?: { topK?: number; collection?: string; filter?: unknown }
) {
    const vectorStore = await getStore();
    const { embedding } = await embed({
        model: google.textEmbeddingModel('gemini-embedding-001'),
        value: question,
    });

    const collection = options?.collection || "documents";

    const results = await vectorStore.query({
        indexName: collection,
        queryVector: embedding,
        topK: options?.topK ?? 5,
        filter: options?.filter as any,
    });

    const normalized = results.map((r: any) => {
        const metadata = r?.metadata ?? {};
        const fileId = metadata.fileId ?? r?.id;
        const filename = metadata.filename ?? metadata.file_name;
        const originalName = metadata.originalName ?? metadata.original_name;
        const rawPage = metadata.page;
        const page = typeof rawPage === 'number' ? rawPage : (Number.isNaN(parseInt(rawPage)) ? undefined : parseInt(rawPage));
        const chunk = metadata.text ?? metadata.content ?? "";
        return { fileId, filename, originalName, chunk, page };
    });

    return { results: normalized };
}

export const ragRetrieverTool = createTool({
	id: "qdrant-rag-retriever",
	description: "Retrieve top-K relevant chunks from local Qdrant using semantic search.",
    inputSchema: z.object({
        question: z.string().describe("Natural language query to search for"),
        topK: z.number().optional().describe("Number of results to retrieve (default 5)"),
        collection: z.string().optional().describe("Qdrant collection name (default: documents)"),
        filter: z.any().optional().describe("Optional metadata filter for search"),
    }),
    outputSchema: z.object({
        results: z.array(
            z.object({
                fileId: z.union([z.string(), z.number()]),
                filename: z.string().optional(),
                originalName: z.string().optional(),
                chunk: z.string(),
                page: z.number().optional(),
            })
        ),
    }),
    execute: async (inputData, _context) => {
        const { question, topK, collection, filter } = inputData;
        return await retrieveTopK(question, { topK, collection, filter });
    },
});


