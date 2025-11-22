const express = require('express');
const ragService = require('../service/rag.service');
const qdrant = require('../controller/qdrant.controller');

const api = express.Router();

// Ingest raw buffer (base64) directly
api.post('/ingestBuffer', async (req, res) => {
    try {
        console.log('[API] POST /rag/ingestBuffer');
        const { base64, fileId, filename, originalName, mimetype } = req.body || {};
        if (!base64 || !fileId) {
            return res.status(400).json({ error: 'base64 and fileId are required' });
        }
        const buffer = Buffer.from(base64, 'base64');
        const out = await ragService.ingestFileBuffer(buffer, { fileId, filename, originalName, mimetype });
        res.status(200).json({ message: 'Ingested', ...out });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to ingest buffer' });
    }
});

api.post('/search', async (req, res) => {
    try {
        console.log('[API] POST /rag/search');
        const { query, limit, filter } = req.body || {};
        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'query is required' });
        }
        const results = await ragService.search(query, Number(limit) || 5, filter);
        res.status(200).json({ results });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to search' });
    }
});


// Status by fileId
api.get('/status/:fileId', async (req, res) => {
    try {
        console.log(`[API] GET /rag/status/${req.params.fileId}`);
        const fileId = req.params.fileId;
        const count = await qdrant.countByFileId(qdrant.collectionName, fileId);
        res.status(200).json({ fileId, vectors: count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

module.exports = api;



