/**
 * Execute expectedSql from sql.seed.json and persist goldRows into sql.captured.json.
 *
 * Usage: npx tsx src/mastra/evals/buildGoldSql.ts [--id sql-001]
 */

import { loadAgentEnv } from './loadEnv.js';

loadAgentEnv();

import { requestAgentApi } from '../tools/agentApiClient.js';
import {
  loadSqlSeeds,
  loadSqlCaptured,
  saveSqlCaptured,
  type SqlCapturedItem,
  parseEvalCliArgs,
} from './loadDatasets.js';

type SqlQueryResponse = {
  sql?: string;
  rows?: Record<string, unknown>[];
};

async function main() {
  const { id: filterId, dryRun } = parseEvalCliArgs(process.argv.slice(2));
  const seeds = loadSqlSeeds().filter((s) => !filterId || s.id === filterId);
  if (seeds.length === 0) {
    console.error(filterId ? `No SQL seed with id=${filterId}` : 'No SQL seeds found');
    process.exit(1);
  }

  const existing = loadSqlCaptured();
  const byId = new Map(existing.map((item) => [item.id, item]));

  for (const seed of seeds) {
    const expectedSql = seed.input.expectedSql;
    console.log(`\n[gold-sql] ${seed.id}: ${seed.input.query.slice(0, 60)}...`);

    if (dryRun) {
      console.log(`  SQL: ${expectedSql.slice(0, 120)}...`);
      continue;
    }

    const result = await requestAgentApi<SqlQueryResponse>({
      method: 'POST',
      path: '/agent/sql/query',
      body: { sql: expectedSql },
    });

    const goldRows = result.rows ?? [];
    const prev = byId.get(seed.id);
    const merged: SqlCapturedItem = {
      ...seed,
      input: {
        ...seed.input,
        expectedRows: goldRows,
      },
      goldRows,
      output: prev?.output ?? {},
      capturedAt: prev?.capturedAt,
      captureMode: prev?.captureMode,
    };
    byId.set(seed.id, merged);
    console.log(`  goldRows: ${goldRows.length} row(s)`);
  }

  if (!dryRun) {
    saveSqlCaptured([...byId.values()]);
    console.log('\n[gold-sql] Updated sql.captured.json');
  }
}

main().catch((err) => {
  console.error('[gold-sql] failed:', err);
  process.exit(1);
});
