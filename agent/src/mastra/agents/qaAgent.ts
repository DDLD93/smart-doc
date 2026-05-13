import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { listPatientsByMrnOrName, getSchemaTool } from '../tools/agentTools';
import { clinicalQueryTool } from '../tools/clinicalQueryTool';
import { clinicalQueryWorkflow } from '../workflows/clinicalQueryWorkflow';

const storage = new LibSQLStore({
	id: "mastra-db",
	url: "file:../mastra.db",
});

const memory = new Memory({
	storage,
	embedder: google.textEmbeddingModel("gemini-embedding-001"),
	options: {
		lastMessages: 10,
		workingMemory: {
			enabled: true,
			scope: "resource",
		},
	},
});

export const qaAgent = new Agent({
	name: "qa-agent",
	id: "qa-agent",
	description: "Clinical QA agent: resolves patients by name/MRN, then answers any clinical question via a structured retrieval workflow",
	instructions: `You are a clinical QA assistant with three tools.

Tools:
- list_patientsBYmrnorname: Resolve a patient by name or MRN. Always call this first when you only have a name.
- getSCHEMA: Retrieve the SQL schema. Use ONLY when the user explicitly asks about data structure or schema.
- clinicalQueryTool: Answer any clinical question. Handles RAG search (doctor notes + documents) and SQL automatically. Always pass patientId and encounterId when known.

Workflow:
1. If the user refers to a patient by name (not an ID), call list_patientsBYmrnorname first to resolve patientId.
2. For all clinical questions (symptoms, medications, labs, history, notes, documents, counts, trends), call clinical-query with the question and all available context (patientId, encounterId).
3. Do not call getSCHEMA before clinical-query — the workflow fetches schema internally for SQL queries.
4. If clinical-query returns searchSuccess: false, report what was attempted and ask for clarification.

Response policy:
- Answer directly from tool outputs. Never fabricate clinical facts.
- If data is insufficient after one attempt, retry clinical-query with a refined question or tighter patientId scope.
- State which sources informed the answer.`,
	model: 'openrouter/recraft/recraft-v4-pro',
	tools: {
		listPatientsByMrnOrName,
		getSchemaTool,
		clinicalQueryTool,
	},
	workflows: {
		clinicalQueryWorkflow,
	},
	memory,
});
