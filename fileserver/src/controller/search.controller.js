'use strict';

const ragService = require('../service/rag.service');
const qdrant = require('./qdrant.controller');

async function embedQuery(queryText) {
    const vectors = await ragService.embedTexts([queryText]);
    const vector = vectors[0];
    if (!vector?.length) throw new Error('Embedding returned empty vector');
    return vector;
}

function parseRequest(body) {
    const { query, limit, filter } = body || {};
    if (!query || !String(query).trim()) return { error: 'query is required' };
    return {
        queryText: String(query).trim(),
        limit: Math.min(Math.max(Number(limit) || 5, 1), 50),
        filter: filter || undefined,
    };
}

class SearchController {
    async searchDocuments(req, res) {
        const parsed = parseRequest(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const { queryText, limit, filter } = parsed;

        console.log(`[Search/documents] query="${queryText.slice(0, 80)}" limit=${limit}`);
        let vector;
        try {
            vector = await embedQuery(queryText);
        } catch (err) {
            console.error('[Search/documents] Embedding failed:', err.message);
            return res.status(500).json({ error: 'Embedding failed' });
        }

        const collection = process.env.QDRANT_COLLECTION || 'documents';
        const results = await qdrant.search(collection, vector, limit, filter);
        res.json({ query: queryText, limit, collection, total: results.length, results });
    }

    async searchDoctorNotes(req, res) {
        const parsed = parseRequest(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const { queryText, limit, filter } = parsed;

        console.log(`[Search/doctor-notes] query="${queryText.slice(0, 80)}" limit=${limit}`);
        let vector;
        try {
            vector = await embedQuery(queryText);
        } catch (err) {
            console.error('[Search/doctor-notes] Embedding failed:', err.message);
            return res.status(500).json({ error: 'Embedding failed' });
        }

        const collection = process.env.QDRANT_DOCTOR_NOTES_COLLECTION || 'doctor_notes';
        const results = await qdrant.search(collection, vector, limit, filter);
        res.json({ query: queryText, limit, collection, total: results.length, results });
    }
}

module.exports = new SearchController();
