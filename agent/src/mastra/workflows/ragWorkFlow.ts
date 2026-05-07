import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { retrieveTopK } from "../tools/ragRetriever";

// Agent for question refinement
const questionRefinementAgent = new Agent({
	id: "rag-question-refinement-agent",
	name: "rag-question-refinement-agent",
	description: "Refines natural language questions for better RAG retrieval",
	instructions: "Refine the user's question for clarity and better semantic search. Focus on key concepts and search terms while preserving the original intent. Return only the refined question.",
	model: "google/gemini-2.5-flash",
});

// Agent for information synthesis
const informationSynthesisAgent = new Agent({
	id: "information-synthesis-agent",
	name: "information-synthesis-agent",
	description: "Synthesizes relevant information from search results into a coherent response",
	instructions: "Synthesize the provided search results into a coherent, helpful response to the user's question. Include key information while maintaining accuracy and clarity.",
	model: "google/gemini-2.5-flash",
});

// Removed local vector search; using external HTTP RAG search tool instead

// Step 1: Accept natural language question
const acceptQuestionStep = createStep({
	id: "accept-question",
	inputSchema: z.object({
		question: z.string().describe("The natural language question to process"),
		topK: z.number().optional().describe("Number of results to retrieve"),
		filter: z.record(z.unknown()).optional().describe("Optional filter for search"),
		patientId: z.string().optional().describe("Optional patient filter"),
		fileId: z.string().optional().describe("Optional file filter"),
		encounterId: z.string().optional().describe("Optional encounter filter"),
		baseUrl: z.string().optional().describe("Optional fileserver base URL"),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		topK: z.number(),
		filter: z.record(z.unknown()).optional(),
		patientId: z.string().optional(),
		fileId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		return {
			originalQuestion: inputData.question,
			topK: inputData.topK || 10,
			filter: inputData.filter,
			patientId: inputData.patientId,
			fileId: inputData.fileId,
			encounterId: inputData.encounterId,
			baseUrl: inputData.baseUrl,
		};
	},
});

// Step 2: Refine question for grammar and clarity
const refineQuestionStep = createStep({
	id: "refine-question",
	inputSchema: z.object({
		originalQuestion: z.string(),
		topK: z.number(),
		filter: z.record(z.unknown()).optional(),
		patientId: z.string().optional(),
		fileId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		topK: z.number(),
		filter: z.record(z.unknown()).optional(),
		patientId: z.string().optional(),
		fileId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		const { originalQuestion, topK, filter, patientId, fileId, encounterId, baseUrl } = inputData;
		
		const prompt = `Refine this question for better semantic search and information retrieval: "${originalQuestion}"
		
Focus on:
- Key concepts and search terms
- Clear intent and scope
- Removing ambiguity while preserving meaning

Return only the refined question.`;
		
		const { text } = await questionRefinementAgent.generate([{ role: "user", content: prompt }]);
		
		return {
			originalQuestion,
			refinedQuestion: text.trim(),
			topK,
			filter,
			patientId,
			fileId,
			encounterId,
			baseUrl,
		};
	},
});

// Step 3: Retrieve relevant chunks via Qdrant-backed tool.

const ragRetrieverStep = createStep({
    id: "rag-retriever",
    inputSchema: z.object({
        originalQuestion: z.string(),
        refinedQuestion: z.string(),
        topK: z.number(),
        filter: z.record(z.unknown()).optional(),
        patientId: z.string().optional(),
        fileId: z.string().optional(),
        encounterId: z.string().optional(),
        baseUrl: z.string().optional(),
    }),
    outputSchema: z.object({
        originalQuestion: z.string(),
        refinedQuestion: z.string(),
        searchResults: z.array(
            z.object({
                fileId: z.union([z.string(), z.number()]),
                filename: z.string().optional(),
                originalName: z.string().optional(),
                chunk: z.string(),
                page: z.number().optional(),
				// score: z.number(),
            })
        ),
        relevantContext: z.string(),
        sources: z.array(z.unknown()),
    }),
    execute: async ({ inputData }) => {
        const { originalQuestion, refinedQuestion, topK, filter, patientId, fileId, encounterId, baseUrl } = inputData;
		const likelyDoctorNotes = /(doctor note|progress note|soap note|clinical note|encounter note)/i.test(refinedQuestion);
		const retrieval = await retrieveTopK(refinedQuestion, {
			topK,
			filter,
			patientId,
			fileId,
			encounterId,
			baseUrl,
			collection: likelyDoctorNotes ? "doctor_notes" : "documents",
		});

        const results = Array.isArray((retrieval as any)?.results) ? (retrieval as any).results : [];
        const searchResults = results as Array<{
			fileId: string | number;
			filename?: string;
			originalName?: string;
			chunk: string;
			page?: number;
			payload?: Record<string, unknown>;
		}>;
        const relevantContext = searchResults
            .map((r) => r.chunk)
            .filter((t) => typeof t === "string" && t.trim().length > 0)
            .join("\n\n");

        return {
            originalQuestion,
            refinedQuestion,
            searchResults,
            relevantContext,
            sources: searchResults,
        };
    },
});
// Step 5: Return relevant information (synthesize and format response)
const synthesizeInformationStep = createStep({
	id: "synthesize-information",
	inputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
        searchResults: z.array(
            z.object({
                fileId: z.union([z.string(), z.number()]),
                filename: z.string().optional(),
                originalName: z.string().optional(),
                chunk: z.string(),
                page: z.number().optional(),
				payload: z.unknown().optional(),
            })
        ),
		relevantContext: z.string(),
		sources: z.array(z.unknown()),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantContext: z.string(),
		synthesizedResponse: z.string(),
		sources: z.array(z.unknown()),
		searchSuccess: z.boolean(),
	}),
	execute: async ({ inputData }) => {
		const { originalQuestion, refinedQuestion, relevantContext, sources } = inputData;
		
		// If no relevant context found, return appropriate response
		if (!relevantContext || (typeof relevantContext === 'string' && relevantContext.trim().length === 0)) {
			return {
				originalQuestion,
				refinedQuestion,
				relevantContext: "",
				synthesizedResponse: "No relevant information found in the knowledge base for this question.",
				sources: [],
				searchSuccess: false,
			};
		}
		
		// Synthesize the information using the synthesis agent
		const prompt = `Based on the following search results, provide a comprehensive answer to the user's question.

Original Question: ${originalQuestion}
Refined Question: ${refinedQuestion}

Search Results:
${relevantContext}

Provide a clear, accurate, and helpful response that directly answers the question using the available information.`;
		
		const { text } = await informationSynthesisAgent.generate([{ role: "user", content: prompt }]);
		
		return {
			originalQuestion,
			refinedQuestion,
			relevantContext,
			synthesizedResponse: text.trim(),
			sources,
			searchSuccess: true,
		};
	},
});

export const ragWorkflow = createWorkflow({
	id: "rag-workflow",
	description: "Complete RAG workflow: accept question, refine, retrieve context, and synthesize answer",
	inputSchema: z.object({
		question: z.string().describe("Natural language question to search for"),
		topK: z.number().optional().describe("Number of results to retrieve (default: 10)"),
		filter: z.record(z.unknown()).optional().describe("Optional filter for search"),
		patientId: z.string().optional(),
		fileId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantContext: z.string(),
		synthesizedResponse: z.string(),
		sources: z.array(z.unknown()),
		searchSuccess: z.boolean(),
	}),
})
	.then(acceptQuestionStep)
	.then(refineQuestionStep)
	.then(ragRetrieverStep)
	.then(synthesizeInformationStep)
	.commit();


