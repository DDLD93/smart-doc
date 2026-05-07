import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ragWorkflow } from "../workflows/ragWorkFlow";

export const ragTool = createTool({
	id: "rag-search",
	description: "Search through the knowledge base using RAG (Retrieval Augmented Generation) to find relevant information and context for answering questions. Follows a comprehensive 5-step workflow: question acceptance, refinement, vectorization, semantic search, and information synthesis.",
	inputSchema: z.object({
		queryText: z.string().describe("The natural language question to search for"),
		topK: z.number().optional().describe("Number of results to retrieve (default: 10)"),
		filter: z.any().optional().describe("Optional filter for search"),
		patientId: z.string().optional(),
		fileId: z.string().optional(),
		encounterId: z.string().optional(),
		baseUrl: z.string().optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string().describe("The original user question"),
		refinedQuestion: z.string().describe("The refined and optimized question"),
		relevantContext: z.string().describe("The relevant context found in the knowledge base"),
		synthesizedResponse: z.string().describe("AI-synthesized response based on the search results"),
		sources: z.array(z.any()).describe("Source documents and metadata"),
		searchSuccess: z.boolean().describe("Whether the search found relevant information")
	}),
	execute: async (inputData, _context) => {
		const { queryText, topK, filter, patientId, fileId, encounterId, baseUrl } = inputData;
		
		// Call the comprehensive workflow that implements all 5 steps from @project.mdc
		const workflowRun = await ragWorkflow.createRun();
		const result = await workflowRun.start({
			inputData: {
				question: queryText,
				topK,
				filter,
				patientId,
				fileId,
				encounterId,
				baseUrl,
			}
		});
		
		// Extract the actual result data from the workflow result
		if (result.status === 'success') {
			return result.result;
		}

		// Handle workflow non-success states
		const errorMessage =
			result.status === "failed" && "error" in result
				? result.error.message
				: `Workflow ${result.status}`;
		return {
			originalQuestion: queryText,
			refinedQuestion: queryText,
			relevantContext: "",
			synthesizedResponse: `RAG search failed: ${errorMessage}`,
			sources: [],
			searchSuccess: false,
		};
	}
});
