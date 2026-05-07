'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../../db/prisma');
const { guard, MAX_LIMIT, DEFAULT_LIMIT } = require('../../util/sqlGuard');

const STATEMENT_TIMEOUT_MS = Number(process.env.AGENT_SQL_TIMEOUT_MS || 5000);

function serializeValue(v) {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (Buffer.isBuffer(v)) return `\\x${v.toString('hex')}`;
    if (v && typeof v === 'object') {
        if (Array.isArray(v)) return v.map(serializeValue);
        const out = {};
        for (const [k, val] of Object.entries(v)) out[k] = serializeValue(val);
        return out;
    }
    return v;
}

function buildSchemaFromDmmf() {
    const dm = Prisma.dmmf;
    if (!dm || !dm.datamodel) return { tables: [], enums: [] };

    const enums = (dm.datamodel.enums || []).map((e) => ({
        name: e.name,
        values: e.values.map((v) => v.name),
    }));

    const enumNames = new Set(enums.map((e) => e.name));

    const tables = (dm.datamodel.models || []).map((model) => {
        const tableName = model.dbName || model.name;
        const fields = (model.fields || []).filter((f) => f.kind !== 'object');
        const columns = fields.map((f) => ({
            name: f.dbName || f.name,
            prismaName: f.name,
            type: enumNames.has(f.type) ? `${f.type} (enum)` : f.type,
            isList: Boolean(f.isList),
            isRequired: Boolean(f.isRequired),
            isId: Boolean(f.isId),
            isUnique: Boolean(f.isUnique),
            hasDefault: Boolean(f.hasDefaultValue),
        }));

        const relations = (model.fields || [])
            .filter((f) => f.kind === 'object' && f.relationFromFields && f.relationFromFields.length)
            .map((f) => ({
                field: f.name,
                referencesModel: f.type,
                fromFields: f.relationFromFields,
                toFields: f.relationToFields,
            }));

        return {
            model: model.name,
            table: tableName,
            columns,
            relations,
        };
    });

    return { tables, enums };
}

class AgentSqlController {
    async getSchema(req, res) {
        try {
            const schema = buildSchemaFromDmmf();
            res.json({
                dialect: 'postgresql',
                ...schema,
                notes: [
                    'Use the table column for the actual SQL identifier (e.g. patients_ehr).',
                    'Soft-deleted rows have deletedAt IS NOT NULL on most tables; filter accordingly.',
                    `SQL is executed inside a READ ONLY transaction with statement_timeout=${STATEMENT_TIMEOUT_MS}ms and an automatic LIMIT (max ${MAX_LIMIT}).`,
                ],
            });
        } catch (err) {
            console.error('[Agent/SQL] getSchema failed:', err);
            res.status(500).json({ error: 'Failed to introspect schema' });
        }
    }

    async runQuery(req, res) {
        const startedAt = Date.now();
        try {
            const { sql, params, limit } = req.body || {};
            const result = guard(sql, { limit });
            if (!result.ok) {
                return res.status(400).json({ error: result.error });
            }

            const args = Array.isArray(params) ? params : [];
            const safeSql = result.sql;

            console.log(`[Agent/SQL] running query (limit=${result.limit}) sql="${safeSql.replace(/\s+/g, ' ').slice(0, 160)}"`);

            const rows = await prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
                await tx.$executeRawUnsafe('SET LOCAL transaction_read_only = on');
                return tx.$queryRawUnsafe(safeSql, ...args);
            });

            const serializedRows = (rows || []).map(serializeValue);
            const columns = serializedRows.length ? Object.keys(serializedRows[0]) : [];

            res.json({
                sql: safeSql,
                limit: result.limit,
                rowCount: serializedRows.length,
                truncated: serializedRows.length === result.limit,
                columns,
                rows: serializedRows,
                durationMs: Date.now() - startedAt,
            });
        } catch (err) {
            const code = err?.code;
            const message = err?.message || 'SQL execution failed';
            console.error('[Agent/SQL] runQuery failed:', code, message);
            const status = /transaction is read-only|read-only transaction|permission denied|cannot execute/i.test(message)
                ? 400
                : 500;
            res.status(status).json({ error: message, code });
        }
    }
}

module.exports = new AgentSqlController();
module.exports.DEFAULT_LIMIT = DEFAULT_LIMIT;
