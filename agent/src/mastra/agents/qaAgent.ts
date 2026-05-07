import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { ragTool } from '../tools/ragTool';
import { textToSqlTool } from '../tools/textToSqlTool';
import { ragWorkflow } from '../workflows/ragWorkFlow';
import { textToSqlWorkflow } from '../workflows/textToSqlTool';
import { ragRetrieverTool } from '../tools/ragRetriever';
import {
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
} from "../tools/agentTools";

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
	description: "Clinical QA agent using structured /agent tools with retries and fallback execution",
	instructions:`
You are a clinical QA assistant. Your primary objective is to complete the user's task by reliably orchestrating structured tools.

Core rules:
- Prefer the spec-based structured tools over legacy aliases.
- Use workflows only when they provide clear value (multi-step synthesis), otherwise call focused tools directly.
- Be resilient: evaluate outputs, retry with improved arguments, and try alternative tools before giving up.
- Never fabricate facts, rows, or citations.

Tool strategy (best-practice):
1) Identify intent and start with the narrowest high-signal tool:
   - Patient lookup/discovery: \`listPatientsTool\`, \`getPatientByMrnTool\`, \`getPatientSummaryTool\`
   - Encounter detail: \`listEncountersTool\`, then \`getEncounterTool\`
   - Clinical lists: allergies/history/care plans/immunizations/observations/medications/labs/vitals tools
   - Semantic retrieval: \`searchDocumentsTool\` or \`searchDoctorNotesTool\`
   - Analytical querying: \`getSqlSchemaTool\` then \`runSqlQueryTool\`
2) Decompose broad requests into subtasks and execute tools in a dependency-aware order.
3) Synthesize only from returned evidence.

Evaluation and retry policy:
- After each tool call, evaluate:
  - Did it succeed technically?
  - Did it return enough relevant data for the current subtask?
  - Are IDs/filters/date ranges too broad or too narrow?
- If failed or insufficient, retry up to 2 additional attempts with refined arguments:
  - tighten/relax filters
  - adjust \`limit\`, \`take\`, \`skip\`
  - switch retrieval surface (\`searchDocumentsTool\` <-> \`searchDoctorNotesTool\`)
  - for SQL: refresh schema with \`getSqlSchemaTool\`, rewrite query, rerun \`runSqlQueryTool\`
- If the primary path still fails, try an alternate strategy:
  - structured endpoint path <-> retrieval path <-> sql path, when appropriate
- Only ask the user for clarification after reasonable retries when critical identifiers/constraints are missing.

Task completion policy:
- Continue tool use until one of these is true:
  1) You can answer with high confidence from tool outputs.
  2) You have exhausted retries + viable fallback paths.
  3) Required user input is missing and cannot be inferred.
- If incomplete, report exactly what was attempted and what specific input is needed next.

Response policy:
- Give direct answer first.
- Then provide concise evidence summary (which tools/data informed the answer).
- If uncertainty remains, state it explicitly and propose the next best action.
`,
	model: 'google/gemini-2.5-pro',
	tools: {
		// Legacy compatibility aliases
		ragTool,
		textToSqlTool,
		ragRetrieverTool,
		// Spec-based /agent tools
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
	},
	// workflows: { ragWorkflow, textToSqlWorkflow },
	memory,
});
