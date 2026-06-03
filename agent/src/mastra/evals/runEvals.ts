/**
 * Batch evaluation — scores captured datasets with all six metrics.
 *
 * Usage: npx tsx src/mastra/evals/runEvals.ts
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAgentEnv } from './loadEnv.js';

loadAgentEnv();

import {
  textToSqlScorerSet,
  answerRelevancyScorer,
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
} from './index.js';
import {
  mergeRagForEval,
  mergeSqlForEval,
  ensureReportsDir,
  REPORTS_DIR,
} from './loadDatasets.js';
import { scoreCapturedBatch, type ScorerRunResult } from './scoreBatch.js';

const ragContextScorers = [
  contextPrecisionScorer,
  contextRecallScorer,
  faithfulnessScorer,
];

const FALLBACK_RAG = [
  {
    input: { query: 'What medications is patient John Doe currently prescribed?' },
    groundTruth:
      'John Doe is prescribed metformin 500 mg twice daily and lisinopril 10 mg once daily.',
    output: {
      text: 'John Doe is on metformin 500 mg and lisinopril 10 mg.',
      context: [
        'Progress note: Patient John Doe started on metformin 500 mg BID for type-2 diabetes.',
        'Prescription record: Lisinopril 10 mg QD added for hypertension management.',
      ],
    },
  },
];

const FALLBACK_SQL = [
  {
    input: {
      query: 'How many patients are in the EHR?',
      expectedSql: 'SELECT COUNT(*)::text AS count FROM patients_ehr WHERE "deletedAt" IS NULL',
      expectedRows: [{ count: '0' }],
    },
    output: {
      sql: 'SELECT COUNT(*)::text AS count FROM patients_ehr WHERE "deletedAt" IS NULL',
      rows: [{ count: '0' }],
    },
  },
];

function logItemResults(
  label: string,
  item: { input?: unknown },
  scorerResults: Record<string, ScorerRunResult>
) {
  const query =
    typeof item.input === 'string'
      ? item.input
      : typeof item.input === 'object' && item.input !== null && 'query' in item.input
        ? String((item.input as { query: string }).query)
        : JSON.stringify(item.input);
  console.log(`\n${label} Query: ${query.slice(0, 80)}`);
  for (const [id, result] of Object.entries(scorerResults)) {
    console.log(`  ${id}: ${result.score.toFixed(2)}  — ${result.reason ?? ''}`);
  }
}

async function main() {
  const ragItems = mergeRagForEval();
  const ragData =
    ragItems.length > 0
      ? ragItems.map((item) => ({
          input: { query: item.input },
          groundTruth: item.groundTruth,
          output: item.output,
        }))
      : FALLBACK_RAG;

  const sqlMerged = mergeSqlForEval();
  const sqlData =
    sqlMerged.length > 0
      ? sqlMerged.map((item) => ({
          input: item.input,
          output: item.output,
        }))
      : FALLBACK_SQL;

  if (ragItems.length === 0) {
    console.warn('[eval:run] No rag.captured.json data — using fallback RAG example.');
  }
  if (sqlMerged.length === 0) {
    console.warn('[eval:run] No sql.captured.json data — using fallback SQL example.');
  }

  const report: {
    runAt: string;
    rag: { items: number; scores: Record<string, number>; perItem: unknown[] };
    sql: { items: number; scores: Record<string, number>; perItem: unknown[] };
  } = {
    runAt: new Date().toISOString(),
    rag: { items: ragData.length, scores: {}, perItem: [] },
    sql: { items: sqlData.length, scores: {}, perItem: [] },
  };

  console.log('\n─── RAG Evaluation (context + faithfulness) ───');
  const ragContextResults = await scoreCapturedBatch({
    scorers: ragContextScorers,
    data: ragData,
    onItemComplete: ({ item, scorerResults }) => {
      logItemResults('[RAG]', item, scorerResults);
      report.rag.perItem.push({ input: item.input, scorerResults });
    },
  });
  Object.assign(report.rag.scores, ragContextResults.scores);

  console.log('\n─── RAG Evaluation (answer relevancy) ───');
  const ragRelevancyData = ragData.map((item) => ({
    input:
      typeof item.input === 'object' && item.input !== null && 'query' in item.input
        ? (item.input as { query: string }).query
        : String(item.input),
    groundTruth: item.groundTruth,
    output:
      typeof item.output === 'object' && item.output !== null && 'text' in item.output
        ? (item.output as { text: string }).text
        : String(item.output),
  }));

  const ragRelevancyResults = await scoreCapturedBatch({
    scorers: [answerRelevancyScorer],
    data: ragRelevancyData,
    onItemComplete: ({ item, scorerResults }) => {
      logItemResults('[RAG relevancy]', item, scorerResults);
    },
  });
  Object.assign(report.rag.scores, ragRelevancyResults.scores);

  console.log('\nRAG aggregate scores:', report.rag.scores);

  console.log('\n─── Text-to-SQL Evaluation ───');
  const sqlResults = await scoreCapturedBatch({
    scorers: textToSqlScorerSet,
    data: sqlData,
    onItemComplete: ({ item, scorerResults }) => {
      logItemResults('[SQL]', item, scorerResults);
      report.sql.perItem.push({ input: item.input, scorerResults });
    },
  });
  report.sql.scores = sqlResults.scores;
  console.log('\nSQL aggregate scores:', report.sql.scores);

  ensureReportsDir();
  const reportPath = join(REPORTS_DIR, 'latest.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`\n[eval:run] Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error('Eval run failed:', err);
  process.exit(1);
});
