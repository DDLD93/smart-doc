const express = require('express');
const ragService = require('../service/rag.service');
const qdrant = require('../controller/qdrant.controller');
const fileController = require('../controller/file.controller');

const api = express.Router();

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

api.get('/jobs/:jobId', async (req, res) => {
    try {
        const out = await fileController.getJob(req.params.jobId);
        if (out.error) {
            return res.status(404).json(out);
        }
        res.status(200).json(out);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get job status' });
    }
});

module.exports = api;



