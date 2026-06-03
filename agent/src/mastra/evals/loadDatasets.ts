import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { RagEvalOutput, SqlEvalOutput } from './evalArtifacts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATASETS_DIR = join(__dirname, 'datasets');
export const REPORTS_DIR = join(__dirname, 'reports');

const ragSeedSchema = z.object({
  id: z.string(),
  input: z.string(),
  groundTruth: z.string().optional(),
  patientId: z.string().optional(),
  encounterId: z.string().optional(),
  limit: z.number().int().optional(),
});

const sqlSeedInputSchema = z.object({
  query: z.string(),
  expectedSql: z.string(),
  expectedRows: z.array(z.record(z.unknown())).optional(),
});

const sqlSeedSchema = z.object({
  id: z.string(),
  input: sqlSeedInputSchema,
  patientId: z.string().optional(),
});

const ragCapturedSchema = ragSeedSchema.extend({
  output: z.object({
    text: z.string(),
    context: z.array(z.string()),
  }),
  capturedAt: z.string().optional(),
  captureMode: z.enum(['agent', 'tools']).optional(),
});

const sqlCapturedSchema = sqlSeedSchema.extend({
  output: z.object({
    sql: z.string().optional(),
    rows: z.array(z.record(z.unknown())).optional(),
  }),
  goldRows: z.array(z.record(z.unknown())).optional(),
  capturedAt: z.string().optional(),
  captureMode: z.enum(['agent', 'tools']).optional(),
});

export type RagSeedItem = z.infer<typeof ragSeedSchema>;
export type SqlSeedItem = z.infer<typeof sqlSeedSchema>;
export type RagCapturedItem = z.infer<typeof ragCapturedSchema>;
export type SqlCapturedItem = z.infer<typeof sqlCapturedSchema>;

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as T;
}

export function loadRagSeeds(): RagSeedItem[] {
  const data = readJson<unknown[]>(join(DATASETS_DIR, 'rag.seed.json'), []);
  return z.array(ragSeedSchema).parse(data);
}

export function loadSqlSeeds(): SqlSeedItem[] {
  const data = readJson<unknown[]>(join(DATASETS_DIR, 'sql.seed.json'), []);
  return z.array(sqlSeedSchema).parse(data);
}

export function loadRagCaptured(): RagCapturedItem[] {
  const data = readJson<unknown[]>(join(DATASETS_DIR, 'rag.captured.json'), []);
  return z.array(ragCapturedSchema).parse(data);
}

export function loadSqlCaptured(): SqlCapturedItem[] {
  const data = readJson<unknown[]>(join(DATASETS_DIR, 'sql.captured.json'), []);
  return z.array(sqlCapturedSchema).parse(data);
}

export function saveRagCaptured(items: RagCapturedItem[]): void {
  const path = join(DATASETS_DIR, 'rag.captured.json');
  writeFileSync(path, JSON.stringify(items, null, 2) + '\n', 'utf-8');
}

export function saveSqlCaptured(items: SqlCapturedItem[]): void {
  const path = join(DATASETS_DIR, 'sql.captured.json');
  writeFileSync(path, JSON.stringify(items, null, 2) + '\n', 'utf-8');
}

/** Merge seed + captured; captured wins per id. */
export function mergeRagForEval(): RagCapturedItem[] {
  const seeds = loadRagSeeds();
  const captured = loadRagCaptured();
  const byId = new Map<string, RagCapturedItem>();
  for (const seed of seeds) {
    byId.set(seed.id, {
      ...seed,
      output: { text: '', context: [] },
    });
  }
  for (const item of captured) {
    byId.set(item.id, item);
  }
  return [...byId.values()].filter((item) => item.output.context.length > 0 || item.output.text.length > 0);
}

/** Merge seed + captured; fill expectedRows from goldRows when present. */
export function mergeSqlForEval(): Array<{
  id: string;
  input: { query: string; expectedSql: string; expectedRows?: unknown[] };
  output: SqlEvalOutput;
}> {
  const seeds = loadSqlSeeds();
  const captured = loadSqlCaptured();
  const byId = new Map<string, SqlCapturedItem>();

  for (const seed of seeds) {
    byId.set(seed.id, {
      ...seed,
      output: {},
    });
  }
  for (const item of captured) {
    byId.set(item.id, item);
  }

  return [...byId.values()]
    .filter((item) => item.output.sql || item.output.rows)
    .map((item) => ({
      id: item.id,
      input: {
        query: item.input.query,
        expectedSql: item.input.expectedSql,
        expectedRows: item.input.expectedRows ?? item.goldRows,
      },
      output: item.output,
    }));
}

/** Format for runEvals — RAG items. */
export function toRunEvalsRagData(items: RagCapturedItem[]) {
  return items.map((item) => ({
    input: { query: item.input },
    groundTruth: item.groundTruth,
    output: item.output as RagEvalOutput,
  }));
}

/** Format for runEvals — SQL items. */
export function toRunEvalsSqlData(
  items: Array<{
    input: { query: string; expectedSql: string; expectedRows?: unknown[] };
    output: SqlEvalOutput;
  }>
) {
  return items.map((item) => ({
    input: item.input,
    output: item.output,
  }));
}

export function ensureReportsDir(): void {
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

export function parseEvalCliArgs(argv: string[]) {
  const only = argv.includes('--only')
    ? (argv[argv.indexOf('--only') + 1] as 'rag' | 'sql' | undefined)
    : undefined;
  const idIdx = argv.indexOf('--id');
  const id = idIdx >= 0 ? argv[idIdx + 1] : undefined;
  const dryRun = argv.includes('--dry-run');
  return { only, id, dryRun };
}
