/**
 * Capture eval cases by running qa-agent end-to-end.
 *
 * Usage: npx tsx src/mastra/evals/captureEvalCasesAgent.ts [--only rag|sql] [--id <id>] [--dry-run]
 */

import { loadAgentEnv } from './loadEnv.js';

loadAgentEnv();
import {
  mapAgentRunToRagEvalOutput,
  mapAgentRunToSqlEvalOutput,
  mergeRagContextFromToolResults,
  buildRagEvalOutput,
} from './evalArtifacts.js';
import { searchDoctorNotesTool, searchDocumentsTool } from '../tools/agentTools.js';
import {
  loadRagSeeds,
  loadSqlSeeds,
  loadRagCaptured,
  loadSqlCaptured,
  saveRagCaptured,
  saveSqlCaptured,
  parseEvalCliArgs,
  type RagCapturedItem,
  type SqlCapturedItem,
} from './loadDatasets.js';

const MAX_STEPS = Number(process.env.EVAL_AGENT_MAX_STEPS ?? 15);

async function getQaAgent() {
  const { mastra } = await import('../index.js');
  return mastra.getAgent('qaAgent');
}

async function captureRag(seeds: ReturnType<typeof loadRagSeeds>, filterId?: string, dryRun?: boolean) {
  const agent = await getQaAgent();
  const existing = loadRagCaptured();
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const seed of seeds) {
    if (filterId && seed.id !== filterId) continue;
    console.log(`\n[capture:agent] RAG ${seed.id}: ${seed.input.slice(0, 70)}...`);

    if (dryRun) continue;

    const result = await agent.generate(seed.input, {
      maxSteps: MAX_STEPS,
      scorers: {},
    });
    let output = mapAgentRunToRagEvalOutput(result, result.text);

    if (output.context.length === 0) {
      const limit = seed.limit ?? 10;
      const [notesResult, docsResult] = await Promise.all([
        searchDoctorNotesTool.execute({
          query: seed.input,
          limit,
          patientId: seed.patientId,
          encounterId: seed.encounterId,
        }),
        searchDocumentsTool.execute({
          query: seed.input,
          limit,
          patientId: seed.patientId,
        }),
      ]);
      const context = mergeRagContextFromToolResults(
        notesResult.success ? notesResult.data : undefined,
        docsResult.success ? docsResult.data : undefined
      );
      output = buildRagEvalOutput(output.text, context);
    }

    const item: RagCapturedItem = {
      ...seed,
      output,
      capturedAt: new Date().toISOString(),
      captureMode: 'agent',
    };
    byId.set(seed.id, item);
    console.log(`  answer length: ${output.text.length}, context chunks: ${output.context.length}`);
  }

  if (!dryRun) {
    saveRagCaptured([...byId.values()]);
    console.log('\n[capture:agent] Updated rag.captured.json');
  }
}

async function captureSql(seeds: ReturnType<typeof loadSqlSeeds>, filterId?: string, dryRun?: boolean) {
  const agent = await getQaAgent();
  const existing = loadSqlCaptured();
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const seed of seeds) {
    if (filterId && seed.id !== filterId) continue;
    const question = seed.input.query;
    console.log(`\n[capture:agent] SQL ${seed.id}: ${question.slice(0, 70)}...`);

    if (dryRun) continue;

    const result = await agent.generate(
      `Answer using SQL only when needed. Question: ${question}`,
      { maxSteps: MAX_STEPS, scorers: {} }
    );
    const output = mapAgentRunToSqlEvalOutput(result);
    const prev = byId.get(seed.id);

    const item: SqlCapturedItem = {
      ...seed,
      input: {
        ...seed.input,
        expectedRows: prev?.input.expectedRows ?? prev?.goldRows ?? seed.input.expectedRows,
      },
      goldRows: prev?.goldRows,
      output,
      capturedAt: new Date().toISOString(),
      captureMode: 'agent',
    };
    byId.set(seed.id, item);
    console.log(`  sql: ${output.sql ? 'yes' : 'no'}, rows: ${output.rows?.length ?? 0}`);
  }

  if (!dryRun) {
    saveSqlCaptured([...byId.values()]);
    console.log('\n[capture:agent] Updated sql.captured.json');
  }
}

async function main() {
  const { only, id, dryRun } = parseEvalCliArgs(process.argv.slice(2));

  if (!only || only === 'rag') {
    await captureRag(loadRagSeeds(), id, dryRun);
  }
  if (!only || only === 'sql') {
    await captureSql(loadSqlSeeds(), id, dryRun);
  }
}

main().catch((err) => {
  console.error('[capture:agent] failed:', err);
  process.exit(1);
});
