import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { clinicalQueryWorkflow } from "../workflows/clinicalQueryWorkflow";
import { errorMessageFromUnknown } from "./toolResultUtils";

export const clinicalQueryTool = createTool({
	id: "clinical-query",
	description:
		"Full clinical query: classifies intent (RAG/SQL/BOTH), searches doctor notes + documents semantically, " +
		"optionally executes SQL, and synthesizes a cited clinical answer. " +
		"Use for any clinical question once patientId is known.",
	inputSchema: z.object({
		question: z.string().min(1).describe("The clinical question to answer"),
		patientId: z.string().optional().describe("Patient ID to scope the search"),
		encounterId: z.string().optional().describe("Encounter ID to scope note search"),
		baseUrl: z.string().optional().describe("Optional base URL for the agent API"),
		limit: z.number().int().min(1).max(200).optional().describe("Max results per search (default 10)"),
	}),
	outputSchema: z.object({
		synthesizedResponse: z.string(),
		sources: z.array(z.string()),
		searchSuccess: z.boolean(),
		sql: z.string().optional(),
		rows: z.array(z.unknown()),
		queryType: z.string(),
	}),
	execute: async (inputData) => {
		try {
			const run = await clinicalQueryWorkflow.createRun();
			const result = await run.start({ inputData });

			if (result.status === "success") return result.result;

			const errorMessage =
				result.status === "failed" && "error" in result
					? errorMessageFromUnknown((result as { error: unknown }).error)
					: `Workflow ended with status: ${result.status}`;

			return {
				synthesizedResponse: `Clinical query workflow failed: ${errorMessage}`,
				sources: [],
				searchSuccess: false,
				sql: undefined,
				rows: [],
				queryType: "UNKNOWN",
			};
		} catch (error) {
			const message = errorMessageFromUnknown(error);
			return {
				synthesizedResponse: `Failed to execute clinical query workflow: ${message}`,
				sources: [],
				searchSuccess: false,
				sql: undefined,
				rows: [],
				queryType: "UNKNOWN",
			};
		}
	},
});
