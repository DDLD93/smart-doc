import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { requestAgentApi } from "./agentApiClient";

const paginationTake = z.number().int().min(1).max(200).optional();
const paginationSkip = z.number().int().min(0).optional();
const passthroughObject = z.object({}).passthrough();

export const listPatientsByMrnOrName = createTool({
	id: "list_patientsBYmrnorname",
	description:
		"Look up patients by name (fuzzy search) or by MRN. " +
		"Detects MRN automatically (short alphanumeric, no spaces) and uses GET /agent/patients/by-mrn/{mrn}. " +
		"Otherwise uses GET /agent/patients?q=... for name search.",
	inputSchema: z.object({
		query: z.string().min(1).describe("Patient name or MRN"),
		take: paginationTake,
		skip: paginationSkip,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: passthroughObject,
	execute: async (input) => {
		const isMrn = /^[A-Za-z0-9\-_]{1,20}$/.test(input.query) && !/\s/.test(input.query);
		if (isMrn) {
			return requestAgentApi({
				method: "GET",
				path: `/agent/patients/by-mrn/${encodeURIComponent(input.query)}`,
				baseUrl: input.baseUrl,
			});
		}
		return requestAgentApi({
			method: "GET",
			path: "/agent/patients",
			query: { q: input.query, take: input.take, skip: input.skip },
			baseUrl: input.baseUrl,
		});
	},
});

export const getSchemaTool = createTool({
	id: "getSCHEMA",
	description: "Get full SQL schema: tables, columns, relations, and enums.",
	inputSchema: z.object({ baseUrl: z.string().url().optional() }),
	outputSchema: passthroughObject,
	execute: async (input) =>
		requestAgentApi({ method: "GET", path: "/agent/sql/schema", baseUrl: input.baseUrl }),
});
