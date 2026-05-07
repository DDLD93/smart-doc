'use strict';

const prisma = require('../../db/prisma');
const qdrant = require('../qdrant.controller');

const TOOLS = [
    {
        name: 'search_documents',
        description: 'Semantic vector search across uploaded clinical documents (PDFs, text, etc). Returns the top-K matching chunks with their source file metadata.',
        method: 'POST',
        path: '/agent/rag/search-documents',
        input: {
            query: { type: 'string', required: true, description: 'Natural-language query.' },
            limit: { type: 'integer', required: false, default: 5, min: 1, max: 50 },
            patientId: { type: 'string', required: false, description: 'Restrict to chunks tagged with this patient.' },
            fileId: { type: 'string', required: false, description: 'Restrict to chunks from a single file.' },
            filter: { type: 'object', required: false, description: 'Raw Qdrant payload filter (advanced).' },
        },
    },
    {
        name: 'search_doctor_notes',
        description: 'Semantic vector search across saved doctor notes (each note embedded whole). Use to find similar past notes by symptom, diagnosis, or plan.',
        method: 'POST',
        path: '/agent/rag/search-doctor-notes',
        input: {
            query: { type: 'string', required: true },
            limit: { type: 'integer', required: false, default: 5, min: 1, max: 50 },
            patientId: { type: 'string', required: false },
            encounterId: { type: 'string', required: false },
            filter: { type: 'object', required: false },
        },
    },
    {
        name: 'list_patients',
        description: 'List or search patients by MRN / first / middle / last name.',
        method: 'GET',
        path: '/agent/patients',
        input: {
            q: { type: 'string', required: false },
            take: { type: 'integer', required: false, default: 50, max: 200 },
            skip: { type: 'integer', required: false, default: 0 },
        },
    },
    {
        name: 'get_patient_by_mrn',
        description: 'Look up a patient record by Medical Record Number.',
        method: 'GET',
        path: '/agent/patients/by-mrn/{mrn}',
        input: { mrn: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'get_patient_summary',
        description: 'Get a patient demographic record plus relation counts (encounters, allergies, etc).',
        method: 'GET',
        path: '/agent/patients/{id}/summary',
        input: { id: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'list_encounters',
        description: 'List encounters for a patient. Supports date range filtering and pagination.',
        method: 'GET',
        path: '/agent/patients/{id}/encounters',
        input: {
            id: { type: 'string', required: true, in: 'path' },
            from: { type: 'string', format: 'date-time', required: false },
            to: { type: 'string', format: 'date-time', required: false },
            take: { type: 'integer', required: false, default: 50 },
            skip: { type: 'integer', required: false, default: 0 },
        },
    },
    {
        name: 'get_encounter',
        description: 'Get a full encounter with symptoms, vitals, diagnoses, clinical notes, medications, lab orders/results, imaging orders/reports, procedures, outcomes, and observations.',
        method: 'GET',
        path: '/agent/encounters/{id}',
        input: { id: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'get_allergies',
        description: 'List active and resolved allergies for a patient.',
        method: 'GET',
        path: '/agent/patients/{id}/allergies',
        input: { id: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'get_medical_history',
        description: 'Get the patient medical history (chronic conditions, family history, etc).',
        method: 'GET',
        path: '/agent/patients/{id}/medical-history',
        input: { id: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'get_care_plans',
        description: 'List care plans for a patient with linked diagnosis context.',
        method: 'GET',
        path: '/agent/patients/{id}/care-plans',
        input: { id: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'get_immunizations',
        description: 'List immunizations administered to a patient.',
        method: 'GET',
        path: '/agent/patients/{id}/immunizations',
        input: { id: { type: 'string', required: true, in: 'path' } },
    },
    {
        name: 'get_observations',
        description: 'List general observations recorded against a patient (BMI, scores, etc).',
        method: 'GET',
        path: '/agent/patients/{id}/observations',
        input: {
            id: { type: 'string', required: true, in: 'path' },
            take: { type: 'integer', required: false, default: 50 },
            skip: { type: 'integer', required: false, default: 0 },
        },
    },
    {
        name: 'get_medications',
        description: 'List medications prescribed across all encounters for a patient.',
        method: 'GET',
        path: '/agent/patients/{id}/medications',
        input: {
            id: { type: 'string', required: true, in: 'path' },
            from: { type: 'string', format: 'date-time', required: false },
            to: { type: 'string', format: 'date-time', required: false },
        },
    },
    {
        name: 'get_lab_results',
        description: 'List lab results across all encounters for a patient (joined with their lab order).',
        method: 'GET',
        path: '/agent/patients/{id}/lab-results',
        input: {
            id: { type: 'string', required: true, in: 'path' },
            from: { type: 'string', format: 'date-time', required: false },
            to: { type: 'string', format: 'date-time', required: false },
        },
    },
    {
        name: 'get_vitals',
        description: 'List vital sign readings across all encounters for a patient.',
        method: 'GET',
        path: '/agent/patients/{id}/vitals',
        input: {
            id: { type: 'string', required: true, in: 'path' },
            from: { type: 'string', format: 'date-time', required: false },
            to: { type: 'string', format: 'date-time', required: false },
        },
    },
    {
        name: 'get_sql_schema',
        description: 'Returns the database tables, columns, types, foreign keys, and enums so the agent can compose valid SELECT queries.',
        method: 'GET',
        path: '/agent/sql/schema',
        input: {},
    },
    {
        name: 'run_sql_query',
        description: 'Execute a read-only SQL SELECT (or WITH ... SELECT) against the EHR Postgres database. Multi-statement queries and any write/DDL keywords are rejected. A LIMIT is automatically injected.',
        method: 'POST',
        path: '/agent/sql/query',
        input: {
            sql: { type: 'string', required: true, description: 'A single SELECT or WITH ... SELECT statement.' },
            params: { type: 'array', required: false, description: 'Positional parameters ($1, $2 ...) for parameterized SQL.' },
            limit: { type: 'integer', required: false, default: 500, max: 500 },
        },
    },
];

class ToolsController {
    list(req, res) {
        res.json({
            baseUrl: `${req.protocol}://${req.get('host')}`,
            count: TOOLS.length,
            tools: TOOLS,
        });
    }

    async health(req, res) {
        const checks = { server: 'ok' };
        let status = 200;

        try {
            await prisma.$queryRawUnsafe('SELECT 1');
            checks.database = 'ok';
        } catch (err) {
            checks.database = `error: ${err.message}`;
            status = 503;
        }

        try {
            const collections = await qdrant.client.getCollections();
            checks.qdrant = `ok (${(collections?.collections || []).length} collections)`;
        } catch (err) {
            checks.qdrant = `error: ${err.message}`;
            status = 503;
        }

        res.status(status).json({ status: status === 200 ? 'OK' : 'DEGRADED', checks });
    }
}

module.exports = new ToolsController();
module.exports.TOOLS = TOOLS;
