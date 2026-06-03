/**
 * Capture eval cases by calling RAG/SQL tools directly (fast, deterministic).
 *
 * Usage: npx tsx src/mastra/evals/captureEvalCasesTools.ts [--only rag|sql] [--id <id>] [--dry-run]
 */

import { loadAgentEnv } from './loadEnv.js';
import {
  extractSqlFromToolData,
  buildRagEvalOutput,
  mergeRagContextFromToolResults,
} from './evalArtifacts.js';
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
import { searchDoctorNotesTool, searchDocumentsTool, runSqlQueryTool } from '../tools/agentTools.js';

loadAgentEnv();

async function captureRag(seeds: ReturnType<typeof loadRagSeeds>, filterId?: string, dryRun?: boolean) {
  const existing = loadRagCaptured();
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const seed of seeds) {
    if (filterId && seed.id !== filterId) continue;
    console.log(`\n[capture:tools] RAG ${seed.id}: ${seed.input.slice(0, 70)}...`);

    if (dryRun) continue;

    const limit = seed.limit ?? 10;
    const base = { query: seed.input, limit, patientId: seed.patientId, encounterId: seed.encounterId };

    const [notesResult, docsResult] = await Promise.all([
      searchDoctorNotesTool.execute(base),
      searchDocumentsTool.execute({ query: seed.input, limit, patientId: seed.patientId }),
    ]);

    const notesData = notesResult.success ? notesResult.data : undefined;
    const docsData = docsResult.success ? docsResult.data : undefined;
    const uniqueContext = mergeRagContextFromToolResults(notesData, docsData);
    const item: RagCapturedItem = {
      ...seed,
      output: buildRagEvalOutput('', uniqueContext),
      capturedAt: new Date().toISOString(),
      captureMode: 'tools',
    };
    byId.set(seed.id, item);
    console.log(`  context chunks: ${uniqueContext.length}`);
  }

  if (!dryRun) {
    saveRagCaptured([...byId.values()]);
    console.log('\n[capture:tools] Updated rag.captured.json');
  }
}

async function captureSql(seeds: ReturnType<typeof loadSqlSeeds>, filterId?: string, dryRun?: boolean) {
  const existing = loadSqlCaptured();
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const seed of seeds) {
    if (filterId && seed.id !== filterId) continue;
    console.log(`\n[capture:tools] SQL ${seed.id}: ${seed.input.query.slice(0, 70)}...`);

    if (dryRun) {
      console.log(`  SQL: ${seed.input.expectedSql.slice(0, 100)}...`);
      continue;
    }

    const result = await runSqlQueryTool.execute({ sql: seed.input.expectedSql });
    if (!result.success) {
      console.error(`  FAILED: ${result.error.message}`);
      continue;
    }

    const { sql, rows } = extractSqlFromToolData(result.data);
    const prev = byId.get(seed.id);
    const item: SqlCapturedItem = {
      ...seed,
      input: {
        ...seed.input,
        expectedRows: rows ?? prev?.input.expectedRows ?? prev?.goldRows,
      },
      goldRows: rows ?? prev?.goldRows,
      output: { sql: sql ?? seed.input.expectedSql, rows },
      capturedAt: new Date().toISOString(),
      captureMode: 'tools',
    };
    byId.set(seed.id, item);
    console.log(`  rows: ${rows?.length ?? 0}`);
  }

  if (!dryRun) {
    saveSqlCaptured([...byId.values()]);
    console.log('\n[capture:tools] Updated sql.captured.json');
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
  console.error('[capture:tools] failed:', err);
  process.exit(1);
});
