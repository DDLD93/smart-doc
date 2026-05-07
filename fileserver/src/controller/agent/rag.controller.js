'use strict';

const ragService = require('../../service/rag.service');
const qdrant = require('../qdrant.controller');

const DOCUMENTS_COLLECTION = () => process.env.QDRANT_COLLECTION || 'documents';
const DOCTOR_NOTES_COLLECTION = () => process.env.QDRANT_DOCTOR_NOTES_COLLECTION || 'doctor_notes';

function clampLimit(value, fallback = 5, max = 50) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.floor(n), 1), max);
}

function buildFilter(convenience, rawFilter) {
    const must = [];
    for (const [key, value] of Object.entries(convenience)) {
        if (value === undefined || value === null || value === '') continue;
        must.push({ key, match: { value: String(value) } });
    }
    if (rawFilter && typeof rawFilter === 'object') {
        if (must.length === 0) return rawFilter;
        if (Array.isArray(rawFilter.must)) {
            return { ...rawFilter, must: [...rawFilter.must, ...must] };
        }
        return { ...rawFilter, must };
    }
    return must.length > 0 ? { must } : undefined;
}

async function embedQuery(queryText) {
    const vectors = await ragService.embedTexts([queryText]);
    const vector = vectors[0];
    if (!vector?.length) throw new Error('Embedding returned empty vector');
    return vector;
}

function shapeResults(rawResults) {
    return (rawResults || []).map((r) => ({
        id: r.id,
        score: r.score,
        payload: r.payload || {},
    }));
}

class AgentRagController {
    async searchDocuments(req, res) {
        try {
            const { query, limit, filter, patientId, fileId } = req.body || {};
            if (!query || !String(query).trim()) {
                return res.status(400).json({ error: 'query is required' });
            }
            const queryText = String(query).trim();
            const lim = clampLimit(limit);
            const compiledFilter = buildFilter({ patientId, fileId }, filter);

            console.log(`[Agent/RAG] documents query="${queryText.slice(0, 80)}" limit=${lim}`);
            const vector = await embedQuery(queryText);
            const collection = DOCUMENTS_COLLECTION();
            const raw = await qdrant.search(collection, vector, lim, compiledFilter);
            const results = shapeResults(raw);
            res.json({ query: queryText, limit: lim, collection, total: results.length, results });
        } catch (err) {
            console.error('[Agent/RAG] searchDocuments failed:', err.message);
            res.status(500).json({ error: 'Failed to search documents' });
        }
    }

    async searchDoctorNotes(req, res) {
        try {
            const { query, limit, filter, patientId, encounterId } = req.body || {};
            if (!query || !String(query).trim()) {
                return res.status(400).json({ error: 'query is required' });
            }
            const queryText = String(query).trim();
            const lim = clampLimit(limit);
            const compiledFilter = buildFilter({ patientId, encounterId }, filter);

            console.log(`[Agent/RAG] doctor-notes query="${queryText.slice(0, 80)}" limit=${lim}`);
            const vector = await embedQuery(queryText);
            const collection = DOCTOR_NOTES_COLLECTION();
            const raw = await qdrant.search(collection, vector, lim, compiledFilter);
            const results = shapeResults(raw);
            res.json({ query: queryText, limit: lim, collection, total: results.length, results });
        } catch (err) {
            console.error('[Agent/RAG] searchDoctorNotes failed:', err.message);
            res.status(500).json({ error: 'Failed to search doctor notes' });
        }
    }
}

module.exports = new AgentRagController();
