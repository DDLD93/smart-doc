import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { Agent } from "@mastra/core/agent";
import { PostgresStore } from "@mastra/pg";

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
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		schemaDescription: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		return {
			originalQuestion: inputData.question,
			schemaDescription: inputData.schemaDescription,
		};
	},
});

// Step 2: Refine question for grammar and clarity  
const refineQuestionStep = createStep({
	id: "refine-question",
	inputSchema: z.object({
		originalQuestion: z.string(),
		schemaDescription: z.string().optional(),
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		schemaDescription: z.string().optional(),
	}),
	execute: async ({ inputData }) => {
		const { originalQuestion, schemaDescription } = inputData;
		
		const prompt = `Refine this question for clarity and better SQL generation: "${originalQuestion}"`;
		const { text } = await questionRefinementAgent.generate([{ role: "user", content: prompt }]);
		
		return {
			originalQuestion,
			refinedQuestion: text.trim(),
			schemaDescription,
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
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantSchema: z.string(),
		generatedSql: z.string(),
	}),
	execute: async ({ inputData }) => {
		const { refinedQuestion, schemaDescription } = inputData;
		
		// Use provided schema or default medical database schema
		const relevantSchema = schemaDescription || `
-- Medical Database Schema (PostgreSQL)

-- Table: patients
-- Description: Patient demographics and basic information
CREATE TABLE patients (
  subject_id INTEGER PRIMARY KEY,
  gender VARCHAR NOT NULL,
  anchor_age INTEGER NOT NULL,
  anchor_year INTEGER NOT NULL,
  anchor_year_group VARCHAR,
  dod TIMESTAMP  -- Date of death (nullable)
);

-- Table: admissions
-- Description: Hospital admission records with admission/discharge details
CREATE TABLE admissions (
  hadm_id VARCHAR PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES patients(subject_id),
  admittime TIMESTAMP NOT NULL,
  dischtime TIMESTAMP NOT NULL,
  deathtime TIMESTAMP,
  admission_type VARCHAR NOT NULL,
  admit_provider_id VARCHAR NOT NULL,
  admission_location VARCHAR,
  discharge_location VARCHAR,
  insurance VARCHAR,
  language VARCHAR,
  marital_status VARCHAR,
  race VARCHAR,
  edregtime TIMESTAMP,  -- Emergency department registration time
  edouttime TIMESTAMP,  -- Emergency department out time
  hospital_expire_flag INTEGER
);

-- Table: emar
-- Description: Electronic Medication Administration Records
CREATE TABLE emar (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES patients(subject_id),
  hadm_id VARCHAR NOT NULL REFERENCES admissions(hadm_id),
  emar_id VARCHAR NOT NULL,
  emar_seq INTEGER NOT NULL,
  poe_id VARCHAR,
  pharmacy_id VARCHAR,
  enter_provider_id VARCHAR,
  charttime TIMESTAMP,
  medication VARCHAR,
  event_txt VARCHAR,
  scheduletime TIMESTAMP,
  storetime TIMESTAMP
);
-- Indexes: hadm_id, subject_id

-- Table: d_icd_diagnoses
-- Description: ICD diagnosis code dictionary with descriptions
CREATE TABLE d_icd_diagnoses (
  icd_code VARCHAR PRIMARY KEY,
  icd_version INTEGER NOT NULL,
  long_title VARCHAR NOT NULL  -- Full description of the diagnosis
);

-- Table: d_hcpcs
-- Description: Healthcare Common Procedure Coding System (HCPCS) dictionary
CREATE TABLE d_hcpcs (
  code VARCHAR PRIMARY KEY,
  category VARCHAR,
  long_description VARCHAR,
  short_description VARCHAR
);

-- Common query patterns:
-- Join patients with admissions: JOIN admissions ON patients.subject_id = admissions.subject_id
-- Join admissions with medications: JOIN emar ON admissions.hadm_id = emar.hadm_id
-- All timestamps are in TIMESTAMP format, use date functions for filtering
		`.trim();
		
		const prompt = `
Schema:
${relevantSchema}

Question: ${refinedQuestion}

Generate a PostgreSQL query to answer this question. Return ONLY the SQL query, no explanations or markdown formatting.`;
		
		const { text } = await sqlGenerationAgent.generate([{ role: "user", content: prompt }]);
		const generatedSql = text.trim().replace(/^```sql\n?|```$/g, "");
		
		return {
			...inputData,
			relevantSchema,
			generatedSql,
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
	}),
	outputSchema: z.object({
		originalQuestion: z.string(),
		refinedQuestion: z.string(),
		relevantSchema: z.string(),
		generatedSql: z.string(),
		validationResult: z.string(),
		isValid: z.boolean(),
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
		const { originalQuestion, refinedQuestion, generatedSql, validationResult, isValid } = inputData;
		
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
		
		// Check if database is configured
		if (!process.env.POSTGRES_CONNECTION_STRING) {
			return {
				originalQuestion,
				refinedQuestion,
				sql: generatedSql,
				validationResult,
				rows: [],
				executionError: "No database connection configured",
				executionSuccess: false,
			};
		}
		
		// Execute the validated SQL
		try {
			const pg = new PostgresStore({ connectionString: process.env.POSTGRES_CONNECTION_STRING });
			await pg.init();
			const rows = await pg.db.any(generatedSql);
			
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


