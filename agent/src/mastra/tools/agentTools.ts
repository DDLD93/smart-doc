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
