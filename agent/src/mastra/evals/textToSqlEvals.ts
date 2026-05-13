import { createScorer } from '@mastra/core/evals';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const judgeModel = google('gemini-2.5-flash');

// ─── Input / output shapes for Text-to-SQL scorers ───────────────────────────
// input  : { query, expectedSql?, expectedRows? }
// output : { sql?, rows? }

// ─── 1. Execution Accuracy ────────────────────────────────────────────────────
// Checks whether the generated SQL produced the correct result set.
//
// Two modes:
//   a) input.expectedRows provided  → exact result-set comparison (no LLM).
//      Score 1 if JSON-serialised rows match, 0 otherwise.
//   b) No expectedRows              → LLM judge assesses whether output.rows
//      correctly answer the natural-language query.
export const executionAccuracyScorer = createScorer<
  { query: string; expectedRows?: unknown[] },
  { sql?: string; rows?: unknown[] }
>({
  id: 'sql-execution-accuracy',
  description:
    'Text-to-SQL metric — compares generated SQL result set against expected rows (exact) or uses LLM to assess correctness.',
  judge: {
    model: judgeModel,
    instructions: `You are a SQL result evaluator.
Given a natural-language question and the rows returned by an executed SQL query, determine whether the results correctly and completely answer the question.
Respond with JSON only — no markdown, no extra text:
{"correct":<true|false>,"reason":"<one sentence explaining why>"}`,
  },
})
  .preprocess(({ run }) => {
    const input = run.input as { query: string; expectedRows?: unknown[] };
    const output = run.output as { rows?: unknown[] };
    const actualRows = output.rows ?? [];
    if (input.expectedRows !== undefined) {
      // Exact comparison — skip LLM analysis
      const match =
        JSON.stringify(actualRows) === JSON.stringify(input.expectedRows);
      return { mode: 'exact' as const, match };
    }
    return { mode: 'llm' as const, query: input.query, rows: actualRows };
  })
  .analyze({
    description:
      'LLM assessment of whether SQL results answer the question (only used when expectedRows is absent)',
    outputSchema: z.object({ correct: z.boolean(), reason: z.string() }),
    createPrompt: ({ results }) => {
      const pre = results.preprocessStepResult as
        | { mode: 'exact'; match: boolean }
        | { mode: 'llm'; query: string; rows: unknown[] };

      if (pre.mode === 'exact') {
        // Dummy prompt — generateScore uses the preprocess result directly.
        // Return a trivially correct JSON so the LLM step doesn't fail.
        return `The result has already been evaluated by exact comparison. Return: {"correct":${pre.match},"reason":"exact result-set comparison"}`;
      }
      return `Question: ${pre.query}\n\nSQL Execution Results (JSON):\n${JSON.stringify(pre.rows, null, 2)}\n\nDo these rows correctly and completely answer the question?`;
    },
  })
  .generateScore(({ results }) => {
    const pre = results.preprocessStepResult as { mode: 'exact'; match: boolean } | { mode: 'llm' };
    if (pre.mode === 'exact') return pre.match ? 1 : 0;
    return (results.analyzeStepResult as { correct: boolean }).correct ? 1 : 0;
  })
  .generateReason(({ score, results }) => {
    const pre = results.preprocessStepResult as { mode: 'exact' | 'llm' };
    if (pre.mode === 'exact') {
      return score === 1
        ? 'Result sets match exactly (exact comparison)'
        : 'Result sets differ (exact comparison)';
    }
    return (results.analyzeStepResult as { reason: string }).reason;
  });

// ─── 2. Exact Match Accuracy ──────────────────────────────────────────────────
// Checks whether the generated SQL string exactly matches the expected SQL after
// normalisation (lowercase + collapse whitespace + strip trailing semicolon).
// Score: 1 if match, 0 otherwise. No LLM involved.
const normalizeSql = (sql: string): string =>
  sql
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;$/, '');

export const exactMatchAccuracyScorer = createScorer<
  { query: string; expectedSql: string },
  { sql?: string; rows?: unknown[] }
>({
  id: 'sql-exact-match',
  description:
    'Text-to-SQL metric — 1 if normalized generated SQL equals expected SQL, 0 otherwise. No LLM required.',
})
  .generateScore(({ run }) => {
    const input = run.input as { expectedSql: string };
    const output = run.output as { sql?: string };
    const expected = normalizeSql(input.expectedSql);
    const actual = normalizeSql(output.sql ?? '');
    return expected === actual ? 1 : 0;
  })
  .generateReason(({ score, run }) => {
    const input = run.input as { expectedSql: string };
    const output = run.output as { sql?: string };
    const expected = normalizeSql(input.expectedSql);
    const actual = normalizeSql(output.sql ?? '');
    return score === 1
      ? 'Generated SQL matches expected SQL after normalization'
      : `SQL mismatch after normalization.\n  Expected: ${expected}\n  Got:      ${actual}`;
  });
