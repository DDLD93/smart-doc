const express = require('express');

const fileController = require('../controller/file.controller');
const ragService = require('../service/rag.service');
const multer = require('multer');
const fs = require('fs');
const path = require('path');




module.exports = (PATH) => {

    // Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = PATH;
        // Ensure uploads directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

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
            
            // Update RAG service configuration if provided
            const { chunkSize, chunkOverlap } = req.body;
            if (chunkSize) {
                ragService.chunkSize = parseInt(chunkSize);
            }
            if (chunkOverlap) {
                ragService.chunkOverlap = parseInt(chunkOverlap);
            }
            
            const data = req.body;
            const result = await fileController.addFile(file, data, PATH);
            
            if (result.error) {
                console.log(`[API] Upload failed: ${result.error}`);
                return res.status(400).json(result);
            }
            
            console.log(`[API] Uploaded ${file.originalname} -> ${result.file.id}`);
            res.status(200).json(result);
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
    api.post('/:id/ingest', async (req, res) => {
        try {
            console.log(`[API] POST /files/${req.params.id}/ingest`);
            const fileResult = await fileController.getFile(req.params.id);
            if (fileResult?.error) return res.status(404).json(fileResult);
            const fullPath = path.join(__dirname, '..', 'uploads', fileResult.filename);
            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ error: 'File not found on disk' });
            }
            const buffer = fs.readFileSync(fullPath);
            const meta = { 
                fileId: fileResult.id, 
                filename: fileResult.filename, 
                originalName: fileResult.name || fileResult.filename,
                mimetype: fileResult.type 
            };
            const out = await ragService.ingestFileBuffer(buffer, meta);
            console.log(`[API] Ingested fileId=${fileResult.id} inserted=${out.inserted}`);
            res.status(200).json({ message: 'Ingested', ...out });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to ingest file '+ error.message });
        }
    });
    return api;
};


