import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Load agent/.env (and repo root .env) without extra dependencies. */
export function loadAgentEnv(): void {
  const evalDir = dirname(fileURLToPath(import.meta.url));
  const agentRoot = resolve(evalDir, '../../..');
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(agentRoot, '.env'),
    resolve(agentRoot, '../.env'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
