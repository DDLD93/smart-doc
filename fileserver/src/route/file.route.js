const express = require('express');
const multer = require('multer');
const fileController = require('../controller/file.controller');

module.exports = () => {
const storage = multer.memoryStorage();

// File filter to allow only certain file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv', 'application/json'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});
    const api = express.Router();

    api.post('/upload', upload.single('file'), async (req, res) => {
        try {
            console.log('[API] POST /files/upload called');
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            
            const data = req.body;
            const result = await fileController.addFile(file, data);
            
            if (result.error) {
                console.log(`[API] Upload failed: ${result.error}`);
                return res.status(400).json(result);
            }
            
            console.log(`[API] Uploaded ${file.originalname} -> ${result.file.id}, job=${result.job.id}`);
            res.status(202).json(result);
        } catch (error) {
            console.error('[API] Upload error:', error);
            res.status(500).json({ error: 'Failed to upload file: ' + error.message });
        }
    });
    api.get('/', async (req, res) => {
        try {
            console.log('[API] GET /files');
            const result = await fileController.getFiles();
            res.status(200).json({ files: result.files || [] });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get files' });
        }
    });
    api.get('/:id', async (req, res) => {
        try {
            console.log(`[API] GET /files/${req.params.id}`);
            const file = await fileController.getFile(req.params.id);
            res.status(200).json({ file });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get file' });
        }
    });
    api.delete('/:id', async (req, res) => {
        try {
            console.log(`[API] DELETE /files/${req.params.id}`);
            const file = await fileController.deleteFile(req.params.id);
            res.status(200).json({ file });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete file' });
        }
    });
    api.get('/:id/download', async (req, res) => {
        try {
            console.log(`[API] GET /files/${req.params.id}/download`);
            const file = await fileController.downloadFile(req.params.id);
            res.status(200).json(file);
        } catch (error) {
            res.status(500).json({ error: 'Failed to download file' });
        }
    });
    api.get('/:id/jobs', async (req, res) => {
        try {
            const out = await fileController.getJobs(req.params.id);
            res.status(200).json(out);
        } catch (error) {
            res.status(500).json({ error: 'Failed to load file jobs' });
        }
    });

    return api;
};


