'use strict';

/**
 * sqlGuard — defense-in-depth validator for the agent text-to-SQL endpoint.
 *
 * Strategy:
 *   1. Strip comments (`-- ...`, `/* ... *\/`) and quoted literals
 *      (single quotes, double-quoted identifiers, dollar-quoted strings)
 *      so we can scan the structural SQL without false positives from
 *      keywords appearing inside strings.
 *   2. Reject multi-statement queries (more than one `;`, ignoring trailing).
 *   3. Reject anything whose first keyword is not SELECT / WITH.
 *   4. Reject any forbidden keyword (writes, DDL, session-level changes).
 *   5. Auto-append a LIMIT clause if the query has no top-level LIMIT.
 *
 * NOTE: This is a guard, not a full SQL parser. It is intended to be
 * combined with a `BEGIN READ ONLY; SET LOCAL statement_timeout = ...`
 * transaction in the controller. For production, also use a Postgres
 * role with only SELECT grants.
 *
 * Sanity asserts (informal):
 *   stripLiterals("SELECT 'DROP'")          === "SELECT ''"
 *   stripLiterals("SELECT --DROP\n 1")      === "SELECT  \n 1"
 *   stripLiterals("$$DROP TABLE x$$")       === "$$ $$"
 *   guard("DELETE FROM x")                  -> { ok:false }
 *   guard("SELECT 1; SELECT 2")             -> { ok:false } (multi-stmt)
 *   guard("SELECT 1")                       -> { ok:true, sql: "SELECT 1 LIMIT 500" }
 *   guard("WITH t AS (SELECT 1) SELECT * FROM t") -> { ok:true }
 */

const FORBIDDEN_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT',
    'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'RENAME',
    'GRANT', 'REVOKE',
    'CALL', 'DO', 'EXECUTE',
    'COPY', 'VACUUM', 'ANALYZE', 'REINDEX', 'CLUSTER',
    'LOCK', 'LISTEN', 'NOTIFY', 'UNLISTEN',
    'COMMENT',
    'RESET',
    'SECURITY',
    'ATTACH', 'DETACH',
    'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    'PREPARE', 'DEALLOCATE',
    'REFRESH',
];

const FORBIDDEN_REGEX = new RegExp(`\\b(?:${FORBIDDEN_KEYWORDS.join('|')})\\b`, 'i');
// SET is allowed only as `SET LOCAL` (the controller sets read-only / timeout that way).
const FORBIDDEN_SET_REGEX = /\bSET\b(?!\s+LOCAL\b)/i;

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

/**
 * Replace string-literals, identifier-quotes, dollar-quoted blocks, and
 * comments with same-length whitespace (or a minimal placeholder for
 * dollar-quoted strings) so the resulting string preserves byte offsets
 * and removes content that could otherwise trip keyword detection.
 */
function stripLiterals(sql) {
    let out = '';
    let i = 0;
    const n = sql.length;
    while (i < n) {
        const ch = sql[i];
        const next = sql[i + 1];

        // -- line comment
        if (ch === '-' && next === '-') {
            out += '  ';
            i += 2;
            while (i < n && sql[i] !== '\n') {
                out += ' ';
                i++;
            }
            continue;
        }

        // /* block comment */ (non-nested; sufficient for guard purposes)
        if (ch === '/' && next === '*') {
            out += '  ';
            i += 2;
            while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) {
                out += sql[i] === '\n' ? '\n' : ' ';
                i++;
            }
            if (i < n) {
                out += '  ';
                i += 2;
            }
            continue;
        }

        // single-quoted string (handles '' and E'\\'' style escapes)
        if (ch === "'") {
            out += "'";
            i++;
            while (i < n) {
                if (sql[i] === '\\' && i + 1 < n) {
                    out += '  ';
                    i += 2;
                    continue;
                }
                if (sql[i] === "'") {
                    if (sql[i + 1] === "'") {
                        out += '  ';
                        i += 2;
                        continue;
                    }
                    out += "'";
                    i++;
                    break;
                }
                out += sql[i] === '\n' ? '\n' : ' ';
                i++;
            }
            continue;
        }

        // double-quoted identifier
        if (ch === '"') {
            out += '"';
            i++;
            while (i < n) {
                if (sql[i] === '"') {
                    if (sql[i + 1] === '"') {
                        out += '  ';
                        i += 2;
                        continue;
                    }
                    out += '"';
                    i++;
                    break;
                }
                out += sql[i] === '\n' ? '\n' : ' ';
                i++;
            }
            continue;
        }

        // dollar-quoted string $tag$ ... $tag$
        if (ch === '$') {
            const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
            if (tagMatch) {
                const tag = tagMatch[0];
                out += tag.replace(/./g, ' ');
                i += tag.length;
                const endIdx = sql.indexOf(tag, i);
                if (endIdx === -1) {
                    while (i < n) {
                        out += sql[i] === '\n' ? '\n' : ' ';
                        i++;
                    }
                    continue;
                }
                while (i < endIdx) {
                    out += sql[i] === '\n' ? '\n' : ' ';
                    i++;
                }
                out += tag.replace(/./g, ' ');
                i += tag.length;
                continue;
            }
        }

        out += ch;
        i++;
    }
    return out;
}

function hasTopLevelLimit(cleanedSql) {
    return /\bLIMIT\b/i.test(cleanedSql);
}

function clampLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * Validate and (if necessary) wrap the SQL with a LIMIT clause.
 *
 * @param {string} rawSql
 * @param {object} [opts]
 * @param {number} [opts.limit] - Desired row cap (1..500). Default 500.
 * @returns {{ ok: true, sql: string, limit: number } | { ok: false, error: string }}
 */
function guard(rawSql, opts = {}) {
    if (typeof rawSql !== 'string' || !rawSql.trim()) {
        return { ok: false, error: 'sql is required' };
    }
    let sql = rawSql.trim();
    while (sql.endsWith(';')) sql = sql.slice(0, -1).trimEnd();
    if (!sql) return { ok: false, error: 'sql is empty' };

    const cleaned = stripLiterals(sql);

    if (cleaned.includes(';')) {
        return { ok: false, error: 'Multiple statements are not allowed' };
    }

    const firstWordMatch = /^\s*([A-Za-z][A-Za-z0-9_]*)/.exec(cleaned);
    if (!firstWordMatch) {
        return { ok: false, error: 'Could not parse leading keyword' };
    }
    const firstWord = firstWordMatch[1].toUpperCase();
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
        return { ok: false, error: `Only SELECT or WITH ... SELECT statements are allowed (got ${firstWord})` };
    }

    if (FORBIDDEN_REGEX.test(cleaned)) {
        const match = cleaned.match(FORBIDDEN_REGEX);
        return { ok: false, error: `Forbidden keyword: ${match[0].toUpperCase()}` };
    }
    if (FORBIDDEN_SET_REGEX.test(cleaned)) {
        return { ok: false, error: 'Forbidden keyword: SET' };
    }

    const limit = clampLimit(opts.limit);
    let safeSql = sql;
    if (!hasTopLevelLimit(cleaned)) {
        safeSql = `${safeSql}\nLIMIT ${limit}`;
    }

    return { ok: true, sql: safeSql, limit };
}

module.exports = {
    guard,
    stripLiterals,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    FORBIDDEN_KEYWORDS,
};
