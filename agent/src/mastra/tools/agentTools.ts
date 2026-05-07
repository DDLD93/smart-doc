import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { requestAgentApi } from "./agentApiClient";

const qdrantFilterSchema = z.record(z.unknown());
const sqlParamSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const dateTimeString = z.string().datetime().or(z.string().min(1));
const paginationTake = z.number().int().min(1).max(200).optional();
const paginationSkip = z.number().int().min(0).optional();

const searchResponseSchema = z.object({
	query: z.string(),
	limit: z.number(),
	collection: z.string(),
	total: z.number(),
	results: z.array(z.unknown()),
});

const listResponseSchema = z
	.object({
		total: z.number().optional(),
		take: z.number().optional(),
		skip: z.number().optional(),
	})
	.passthrough();

const passthroughObject = z.object({}).passthrough();

type BaseInput = { baseUrl?: string };

export const searchDocumentsTool = createTool({
	id: "search_documents",
	description: "Semantic vector search across uploaded clinical documents.",
	inputSchema: z.object({
		query: z.string().min(1),
		limit: z.number().int().min(1).max(50).optional(),
		patientId: z.string().optional(),
		fileId: z.string().optional(),
		filter: qdrantFilterSchema.optional(),
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: searchResponseSchema,
	execute: async (input) =>
		requestAgentApi({
			method: "POST",
			path: "/agent/rag/search-documents",
			body: {
				query: input.query,
				limit: input.limit,
				patientId: input.patientId,
				fileId: input.fileId,
				filter: input.filter,
			},
			baseUrl: input.baseUrl,
		}),
});

export const searchDoctorNotesTool = createTool({
	id: "search_doctor_notes",
	description: "Semantic vector search across saved doctor notes.",
	inputSchema: z.object({
		query: z.string().min(1),
		limit: z.number().int().min(1).max(50).optional(),
		patientId: z.string().optional(),
		encounterId: z.string().optional(),
		filter: qdrantFilterSchema.optional(),
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: searchResponseSchema,
	execute: async (input) =>
		requestAgentApi({
			method: "POST",
			path: "/agent/rag/search-doctor-notes",
			body: {
				query: input.query,
				limit: input.limit,
				patientId: input.patientId,
				encounterId: input.encounterId,
				filter: input.filter,
			},
			baseUrl: input.baseUrl,
		}),
});

export const listPatientsTool = createTool({
	id: "list_patients",
	description: "List or search patients by MRN or name.",
	inputSchema: z.object({
		q: z.string().optional(),
		take: paginationTake,
		skip: paginationSkip,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: listResponseSchema,
	execute: async (input) =>
		requestAgentApi({
			method: "GET",
			path: "/agent/patients",
			query: { q: input.q, take: input.take, skip: input.skip },
			baseUrl: input.baseUrl,
		}),
});

export const getPatientByMrnTool = createTool({
	id: "get_patient_by_mrn",
	description: "Look up a patient record by medical record number.",
	inputSchema: z.object({
		mrn: z.string().min(1),
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: passthroughObject,
	execute: async (input) =>
		requestAgentApi({
			method: "GET",
			path: `/agent/patients/by-mrn/${encodeURIComponent(input.mrn)}`,
			baseUrl: input.baseUrl,
		}),
});

export const getPatientSummaryTool = createTool({
	id: "get_patient_summary",
	description: "Get patient demographics and relation counts.",
	inputSchema: z.object({
		id: z.string().min(1),
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: passthroughObject,
	execute: async (input) =>
		requestAgentApi({
			method: "GET",
			path: `/agent/patients/${encodeURIComponent(input.id)}/summary`,
			baseUrl: input.baseUrl,
		}),
});

export const listEncountersTool = createTool({
	id: "list_encounters",
	description: "List encounters for a patient with optional date/pagination filters.",
	inputSchema: z.object({
		id: z.string().min(1),
		from: dateTimeString.optional(),
		to: dateTimeString.optional(),
		take: paginationTake,
		skip: paginationSkip,
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: listResponseSchema,
	execute: async (input) =>
		requestAgentApi({
			method: "GET",
			path: `/agent/patients/${encodeURIComponent(input.id)}/encounters`,
			query: { from: input.from, to: input.to, take: input.take, skip: input.skip },
			baseUrl: input.baseUrl,
		}),
});

export const getEncounterTool = createTool({
	id: "get_encounter",
	description: "Get a full encounter with all related clinical collections.",
	inputSchema: z.object({
		id: z.string().min(1),
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: passthroughObject,
	execute: async (input) =>
		requestAgentApi({
			method: "GET",
			path: `/agent/encounters/${encodeURIComponent(input.id)}`,
			baseUrl: input.baseUrl,
		}),
});

function createPatientCollectionTool(id: string, description: string, suffix: string) {
	return createTool({
		id,
		description,
		inputSchema: z.object({
			id: z.string().min(1),
			take: paginationTake.optional(),
			skip: paginationSkip.optional(),
			from: dateTimeString.optional(),
			to: dateTimeString.optional(),
			baseUrl: z.string().url().optional(),
		}),
		outputSchema: listResponseSchema,
		execute: async (input: { id: string; take?: number; skip?: number; from?: string; to?: string } & BaseInput) =>
			requestAgentApi({
				method: "GET",
				path: `/agent/patients/${encodeURIComponent(input.id)}/${suffix}`,
				query: {
					take: input.take,
					skip: input.skip,
					from: input.from,
					to: input.to,
				},
				baseUrl: input.baseUrl,
			}),
	});
}

export const getAllergiesTool = createPatientCollectionTool(
	"get_allergies",
	"List active and resolved allergies for a patient.",
	"allergies",
);
export const getMedicalHistoryTool = createPatientCollectionTool(
	"get_medical_history",
	"Get the patient medical history.",
	"medical-history",
);
export const getCarePlansTool = createPatientCollectionTool(
	"get_care_plans",
	"List care plans for a patient.",
	"care-plans",
);
export const getImmunizationsTool = createPatientCollectionTool(
	"get_immunizations",
	"List immunizations administered to a patient.",
	"immunizations",
);
export const getObservationsTool = createPatientCollectionTool(
	"get_observations",
	"List observations recorded against a patient.",
	"observations",
);
export const getMedicationsTool = createPatientCollectionTool(
	"get_medications",
	"List medications prescribed to a patient.",
	"medications",
);
export const getLabResultsTool = createPatientCollectionTool(
	"get_lab_results",
	"List lab results across encounters for a patient.",
	"lab-results",
);
export const getVitalsTool = createPatientCollectionTool(
	"get_vitals",
	"List vital sign readings for a patient.",
	"vitals",
);

export const getSqlSchemaTool = createTool({
	id: "get_sql_schema",
	description: "Get tables, columns, relations, and enums for SQL query composition.",
	inputSchema: z.object({
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: passthroughObject,
	execute: async (input) =>
		requestAgentApi({
			method: "GET",
			path: "/agent/sql/schema",
			baseUrl: input.baseUrl,
		}),
});

export const runSqlQueryTool = createTool({
	id: "run_sql_query",
	description: "Execute a read-only SELECT query against the EHR database.",
	inputSchema: z.object({
		sql: z.string().min(1),
		params: z.array(sqlParamSchema).optional(),
		limit: z.number().int().min(1).max(500).optional(),
		baseUrl: z.string().url().optional(),
	}),
	outputSchema: passthroughObject,
	execute: async (input) =>
		requestAgentApi({
			method: "POST",
			path: "/agent/sql/query",
			body: { sql: input.sql, params: input.params, limit: input.limit },
			baseUrl: input.baseUrl,
		}),
});

export const agentSpecTools = {
	searchDocumentsTool,
	searchDoctorNotesTool,
	listPatientsTool,
	getPatientByMrnTool,
	getPatientSummaryTool,
	listEncountersTool,
	getEncounterTool,
	getAllergiesTool,
	getMedicalHistoryTool,
	getCarePlansTool,
	getImmunizationsTool,
	getObservationsTool,
	getMedicationsTool,
	getLabResultsTool,
	getVitalsTool,
	getSqlSchemaTool,
	runSqlQueryTool,
};

