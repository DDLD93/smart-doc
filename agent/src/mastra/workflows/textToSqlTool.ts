import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { requestAgentApi } from "../tools/agentApiClient";

// Agent for question refinement
const questionRefinementAgent = new Agent({
	id: "question-refinement-agent",
	name: "question-refinement-agent",
	description: "Refines natural language questions for clarity and better SQL generation",
	instructions: "Refine the user's question for grammar and clarity while preserving the original intent. Return only the refined question.",
	model: "google/gemini-2.5-flash",
});

// Agent for SQL generation
const sqlGenerationAgent = new Agent({
	id: "sql-generation-agent",
	name: "sql-generation-agent",
	description: "Generates SQL queries from refined natural language questions",
	instructions: "You translate refined natural language questions into a single SQL statement valid for PostgreSQL. Output ONLY SQL. Use SELECT by default; never DROP/DELETE/UPDATE without explicit permission.",
	model: "google/gemini-2.5-flash",
});

// Agent for SQL validation
const sqlValidationAgent = new Agent({
	id: "sql-validation-agent",
	name: "sql-validation-agent", 
	description: "Validates SQL queries for correctness and safety",
	instructions: "Review the SQL query for correctness, safety, and PostgreSQL compatibility. Return 'VALID' if safe to execute, or 'INVALID: [reason]' if not. Focus on preventing destructive operations and syntax errors.",
	model: "google/gemini-2.5-flash",
});

// Step 1: Accept natural language question
const acceptQuestionStep = createStep({
	id: "accept-question",
	inputSchema: z.object({
		question: z.string().describe("The natural language question to process"),
		schemaDescription: z.string().optional().describe("Optional database schema description"),
		baseUrl: z.string().optional().describe("Optional fileserver base URL"),
		limit: z.number().int().min(1).max(500).optional().describe("Result limit"),
		params: z.array(z.any()).optional().describe("Optional SQL positional params"),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		schemaDescription: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	execute: async ({ inputData }) => {
		return {
			originalQuestion: inputData.question,
			schemaDescription: inputData.schemaDescription,
			baseUrl: inputData.baseUrl,
			limit: inputData.limit,
			params: inputData.params,
		};
	},
});

// Step 2: Refine question for grammar and clarity  
const refineQuestionStep = createStep({
	id: "refine-question",
	inputSchema: z.object({
		originalQuestion: z.string(),
		schemaDescription: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		schemaDescription: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	execute: async ({ inputData }) => {
		const { originalQuestion, schemaDescription, baseUrl, limit, params } = inputData;
		
		const prompt = `Refine this question for clarity and better SQL generation: "${originalQuestion}"`;
		const { text } = await questionRefinementAgent.generate([{ role: "user", content: prompt }]);
		
		return {
			originalQuestion,
			refinedQuestion: text.trim(),
			schemaDescription,
			baseUrl,
			limit,
			params,
		};
	},
});

// Step 3: Translate to valid SQL query
const translateToSqlStep = createStep({
	id: "translate-to-sql",
	inputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		schemaDescription: z.string().optional(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantSchema: z.string(),
		generatedSql: z.string(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	execute: async ({ inputData }) => {
		const { refinedQuestion, schemaDescription, baseUrl, limit, params } = inputData;
		const schemaPayload = schemaDescription
			? { schemaDescription }
			: await requestAgentApi<Record<string, unknown>>({
					method: "GET",
					path: "/agent/sql/schema",
					baseUrl,
				});
		const relevantSchema = JSON.stringify(schemaPayload, null, 2);
		
		const prompt = `
Schema:
${relevantSchema}

Question: ${refinedQuestion}

Generate a PostgreSQL query to answer this question.
Return ONLY one SQL statement that is a SELECT or WITH ... SELECT query.
Do not include markdown fences or explanations.`;
		
		const { text } = await sqlGenerationAgent.generate([{ role: "user", content: prompt }]);
		const generatedSql = text.trim().replace(/^```sql\n?|```$/g, "");
		
		return {
			originalQuestion: inputData.originalQuestion,
			refinedQuestion,
			relevantSchema,
			generatedSql,
			baseUrl,
			limit,
			params,
		};
	},
});

// Step 4: Validate SQL correctness and safety
const validateSqlStep = createStep({
	id: "validate-sql",
	inputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantSchema: z.string(),
		generatedSql: z.string(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantSchema: z.string(),
		generatedSql: z.string(),
		validationResult: z.string(),
		isValid: z.boolean(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	execute: async ({ inputData }) => {
		const { generatedSql, relevantSchema } = inputData;
		
		const prompt = `
Schema:
${relevantSchema}

SQL Query to validate:
${generatedSql}

Validate this SQL query for:
1. PostgreSQL syntax correctness
2. Safety (no DROP, DELETE, UPDATE without proper conditions)
3. Logic correctness

Return either "VALID" or "INVALID: [detailed reason]"`;
		
		const { text } = await sqlValidationAgent.generate([{ role: "user", content: prompt }]);
		const validationResult = text.trim();
		const isValid = validationResult.toUpperCase().startsWith("VALID");
		
		return {
			...inputData,
			validationResult,
			isValid,
		};
	},
});

// Step 5: Execute query and return results
const executeQueryStep = createStep({
	id: "execute-query",
	inputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantSchema: z.string(),
		generatedSql: z.string(),
		validationResult: z.string(),
		isValid: z.boolean(),
		baseUrl: z.string().optional(),
		limit: z.number().optional(),
		params: z.array(z.any()).optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		sql: z.string(),
		validationResult: z.string(),
		rows: z.array(z.any()),
		executionError: z.string().optional(),
		executionSuccess: z.boolean(),
	}),
	execute: async ({ inputData }) => {
		const { originalQuestion, refinedQuestion, generatedSql, validationResult, isValid, baseUrl, limit, params } = inputData;
		
		// If validation failed, don't execute
		if (!isValid) {
			return {
				originalQuestion,
				refinedQuestion,
				sql: generatedSql,
				validationResult,
				rows: [],
				executionError: `SQL validation failed: ${validationResult}`,
				executionSuccess: false,
			};
		}
		
		try {
			const data = await requestAgentApi<{ rows?: unknown[] }>({
				method: "POST",
				path: "/agent/sql/query",
				body: {
					sql: generatedSql,
					limit,
					params,
				},
				baseUrl,
			});
			const rows = Array.isArray(data?.rows) ? data.rows : [];
			
			return {
				originalQuestion,
				refinedQuestion,
				sql: generatedSql,
				validationResult,
				rows,
				executionSuccess: true,
			};
		} catch (error) {
			return {
				originalQuestion,
				refinedQuestion,
				sql: generatedSql,
				validationResult,
				rows: [],
				executionError: error instanceof Error ? error.message : 'Unknown database error',
				executionSuccess: false,
			};
		}
	},
});

export const textToSqlWorkflow = createWorkflow({
	id: "text-to-sql-workflow",
	description: "Complete Text-to-SQL workflow following the 5-step process: accept question, refine question, translate to SQL, validate SQL, and execute query",
	inputSchema: z.object({
		question: z.string().describe("Natural language question to convert to SQL"),
		schemaDescription: z.string().optional().describe("Optional database schema description"),
		baseUrl: z.string().optional().describe("Optional fileserver base URL"),
		limit: z.number().int().min(1).max(500).optional().describe("Optional result row limit"),
		params: z.array(z.any()).optional().describe("Optional SQL positional parameters"),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		sql: z.string(),
		validationResult: z.string(),
		rows: z.array(z.any()),
		executionError: z.string().optional(),
		executionSuccess: z.boolean(),
	}),
})
	.then(acceptQuestionStep)
	.then(refineQuestionStep)
	.then(translateToSqlStep)
	.then(validateSqlStep)
	.then(executeQueryStep)
	.commit();


