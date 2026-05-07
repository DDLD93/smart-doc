import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { textToSqlWorkflow } from "../workflows/textToSqlTool";

const sqlParamSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const textToSqlTool = createTool({
	id: "text-to-sql",
	description: "Convert natural language questions into SQL queries and execute them against the PostgreSQL database to retrieve structured data. Follows a comprehensive 6-step workflow: question acceptance, refinement, schema determination, SQL generation, validation, and execution.",
	inputSchema: z.object({
		queryText: z.string().describe("The natural language question to convert to SQL"),
		schemaDescription: z.string().optional().describe("Optional description of the database schema, tables, and columns available"),
		baseUrl: z.string().optional().describe("Optional fileserver base URL"),
		limit: z.number().int().min(1).max(500).optional().describe("Optional SQL result limit"),
		params: z
			.array(sqlParamSchema)
			.optional()
			.describe("Optional SQL positional parameters"),
	}),
	outputSchema: z.object({
		originalQuestion: z.string().describe("The original user question"),
		refinedQuestion: z.string().describe("The refined and clarified question"),
		sql: z.string().describe("The generated and validated SQL query"),
		validationResult: z.string().describe("The result of SQL validation"),
		rows: z.array(z.unknown()).describe("The results from executing the SQL query"),
		executionError: z.string().optional().describe("Any error that occurred during execution"),
		executionSuccess: z.boolean().describe("Whether the SQL execution was successful")
	}),
	execute: async (inputData, _context) => {
		const { queryText, schemaDescription, baseUrl, limit, params } = inputData;
		
		// Call the comprehensive workflow that implements all 6 steps from @project.mdc
		const workflowRun = await textToSqlWorkflow.createRun();
		const result = await workflowRun.start({
			inputData: {
				question: queryText,
				schemaDescription,
				baseUrl,
				limit,
				params,
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
			sql: "",
			validationResult: "INVALID: Workflow execution failed",
			rows: [],
			executionError: errorMessage,
			executionSuccess: false,
		};
	}
});
