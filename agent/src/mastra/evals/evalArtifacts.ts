/**
 * Extract and normalize RAG/SQL artifacts for eval datasets and scorers.
 */

export type RagEvalInput = { query: string; groundTruth?: string };
export type RagEvalOutput = { text: string; context: string[] };
export type SqlEvalInput = {
  query: string;
  expectedSql?: string;
  expectedRows?: unknown[];
};
export type SqlEvalOutput = { sql?: string; rows?: unknown[] };

export type ParsedToolArtifacts = {
  context: string[];
  sql?: string;
  rows?: unknown[];
};

/** Normalize dataset/agent input to `{ query }`. */
export function normalizeEvalInput(
  input: string | RagEvalInput | SqlEvalInput
): RagEvalInput | SqlEvalInput {
  if (typeof input === 'string') {
    return { query: input };
  }
  if (input && typeof input === 'object' && 'query' in input && typeof input.query === 'string') {
    return input;
  }
  return { query: JSON.stringify(input) };
}

/** Read query from a scorer run (string or object input). */
export function getQueryFromRun(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'query' in input) {
    const q = (input as { query?: unknown }).query;
    if (typeof q === 'string') return q;
  }
  return '';
}

/** Extract chunk text from a single Qdrant RAG hit. */
export function chunkTextFromRagHit(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const payload = record.payload as Record<string, unknown> | undefined;
  const text =
    (typeof payload?.text === 'string' && payload.text) ||
    (typeof payload?.noteText === 'string' && payload.noteText) ||
    (typeof record.chunk === 'string' && record.chunk) ||
    null;
  if (text) return text;
  return JSON.stringify(result).slice(0, 500);
}

/** Flatten RAG tool `data` (search notes/documents API shape) into deduped context strings. */
export function extractContextFromToolData(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const results = (data as { results?: unknown[] }).results;
  if (!Array.isArray(results)) return [];

  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const hit of results) {
    const text = chunkTextFromRagHit(hit);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    chunks.push(text);
  }
  return chunks;
}

/** Extract SQL + rows from run_sql_query tool success payload. */
export function extractSqlFromToolData(data: unknown): SqlEvalOutput {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const sql = typeof d.sql === 'string' ? d.sql : undefined;
  const rows = Array.isArray(d.rows) ? d.rows : undefined;
  return { sql, rows };
}

export function buildRagEvalOutput(agentText: string, contextChunks: string[]): RagEvalOutput {
  return {
    text: agentText,
    context: contextChunks,
  };
}

/** Prefer doctor-note hits; fall back to document chunks when notes collection is empty. */
export function mergeRagContextFromToolResults(
  notesData: unknown,
  docsData: unknown
): string[] {
  const notes = extractContextFromToolData(notesData);
  if (notes.length > 0) return notes;
  return extractContextFromToolData(docsData);
}

const RAG_TOOL_IDS = new Set(['search_doctor_notes', 'search_documents']);
const SQL_TOOL_ID = 'run_sql_query';

function toolNameFromResultEntry(entry: Record<string, unknown>): string {
  const payload = entry.payload as Record<string, unknown> | undefined;
  return (
    (typeof payload?.toolName === 'string' && payload.toolName) ||
    (typeof entry.toolName === 'string' && entry.toolName) ||
    (typeof entry.name === 'string' && entry.name) ||
    (typeof entry.toolId === 'string' && entry.toolId) ||
    ''
  );
}

function resultFromResultEntry(entry: Record<string, unknown>): unknown {
  const payload = entry.payload as Record<string, unknown> | undefined;
  return payload?.result ?? entry.result ?? entry.output;
}

function collectFromToolResultEntry(entry: unknown, artifacts: ParsedToolArtifacts): void {
  if (!entry || typeof entry !== 'object') return;
  const record = entry as Record<string, unknown>;
  collectFromToolInvocation(
    toolNameFromResultEntry(record),
    resultFromResultEntry(record),
    artifacts
  );
}

function collectFromToolInvocation(
  toolName: string,
  result: unknown,
  artifacts: ParsedToolArtifacts
): void {
  if (!result || typeof result !== 'object') return;
  const envelope = result as { success?: boolean; data?: unknown };
  if (envelope.success === false) return;
  const data = envelope.success === true ? envelope.data : result;

  if (RAG_TOOL_IDS.has(toolName)) {
    artifacts.context.push(...extractContextFromToolData(data));
  } else if (toolName === SQL_TOOL_ID) {
    const sqlOut = extractSqlFromToolData(data);
    if (sqlOut.sql) artifacts.sql = sqlOut.sql;
    if (sqlOut.rows) artifacts.rows = sqlOut.rows;
  }
}

function walkSteps(steps: unknown[], artifacts: ParsedToolArtifacts): void {
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const s = step as Record<string, unknown>;

    const toolResults = s.toolResults;
    if (Array.isArray(toolResults)) {
      for (const tr of toolResults) {
        collectFromToolResultEntry(tr, artifacts);
      }
    }

    for (const key of ['staticToolResults', 'dynamicToolResults'] as const) {
      const arr = s[key];
      if (Array.isArray(arr)) {
        for (const tr of arr) {
          collectFromToolResultEntry(tr, artifacts);
        }
      }
    }

    const toolCalls = s.toolCalls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (!tc || typeof tc !== 'object') continue;
        const t = tc as Record<string, unknown>;
        const name =
          (typeof t.toolName === 'string' && t.toolName) ||
          (typeof t.name === 'string' && t.name) ||
          '';
        collectFromToolInvocation(name, t.result ?? t.output, artifacts);
      }
    }
  }
}

let loggedGenerateShape = false;

/**
 * Parse Mastra agent.generate() response into eval artifacts.
 * Tolerates multiple trace shapes across @mastra/core versions.
 */
export function parseToolResultsFromGenerate(result: unknown): ParsedToolArtifacts {
  const artifacts: ParsedToolArtifacts = { context: [] };

  if (!result || typeof result !== 'object') return artifacts;
  const r = result as Record<string, unknown>;

  if (Array.isArray(r.steps)) {
    walkSteps(r.steps, artifacts);
  }

  if (Array.isArray(r.toolResults)) {
    for (const tr of r.toolResults) {
      collectFromToolResultEntry(tr, artifacts);
    }
  }

  // Dedupe context
  artifacts.context = [...new Set(artifacts.context)];

  if (
    !loggedGenerateShape &&
    artifacts.context.length === 0 &&
    !artifacts.sql &&
    !artifacts.rows
  ) {
    const keys = Object.keys(r).join(', ');
    console.warn(
      `[eval] No tool artifacts parsed from generate() response (top-level keys: ${keys}). ` +
        'Capture may need a Mastra trace shape update.'
    );
    loggedGenerateShape = true;
  }

  return artifacts;
}

/** Map agent text + parsed tools to RAG eval output. */
export function mapAgentRunToRagEvalOutput(
  generateResult: unknown,
  agentText?: string
): RagEvalOutput {
  const parsed = parseToolResultsFromGenerate(generateResult);
  const text =
    agentText ??
    (typeof generateResult === 'object' &&
    generateResult !== null &&
    typeof (generateResult as { text?: string }).text === 'string'
      ? (generateResult as { text: string }).text
      : '');
  return buildRagEvalOutput(text, parsed.context);
}

/** Map agent run to SQL eval output (last SQL tool wins). */
export function mapAgentRunToSqlEvalOutput(generateResult: unknown): SqlEvalOutput {
  const parsed = parseToolResultsFromGenerate(generateResult);
  return { sql: parsed.sql, rows: parsed.rows };
}
