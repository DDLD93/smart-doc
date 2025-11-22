const db = require('../connection/jsondb.connection');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ragService = require('../service/rag.service');

class FileController {
    constructor() {}

    // Helper function to get file stats
    getFileStats(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime
            };
        } catch (error) {
            return null;
        }
    }

    async addFile(file, data, uploadPath) {
        try {
            if (!file) {
                return { error: 'No file uploaded' };
            }

            // Validate file size
            if (file.size > ragService.maxFileSize) {
                return { error: `File too large. Maximum size is ${ragService.maxFileSize} bytes` };
            }

            const fileId = uuidv4().replace(/-/g, '');
            const filename = `${fileId}${path.extname(file.originalname)}`;
            
            // Create file object with buffer for processing
            const fileObj = {
                ...file,
                filename: filename,
                buffer: file.buffer || fs.readFileSync(file.path)
            };

            console.log(`[FileController] Starting upload process for fileId=${fileId}`);
            
            // Process file transactionally (save, extract, chunk, embed, store)
            const result = await ragService.processFileTransactionally(fileObj, fileId, uploadPath);
            
            if (!result.success) {
                return { 
                    error: `File processing failed: ${result.error}`,
                    details: result.steps
                };
            }

            // Save metadata to database only after successful processing
            const fileData = {
                id: fileId,
                originalName: file.originalname,
                filename: filename,
                mimetype: file.mimetype,
                size: file.size,
                uploadDate: new Date().toISOString(),
                path: `/uploads/${filename}`,
                fullPath: path.join(uploadPath, filename),
                processingStats: result.stats,
                processingSteps: result.steps
            };

            await db.push(`/files/${fileId}`, fileData);

            console.log(`[FileController] Upload completed successfully for fileId=${fileId}`);
            return {
                message: 'File uploaded and processed successfully',
                file: {
                    id: fileId,
                    name: fileData.originalName,
                    size: fileData.size,
                    type: fileData.mimetype,
                    url: fileData.path,
                    uploadDate: fileData.uploadDate,
                    stats: result.stats
                },
                processing: {
                    steps: result.steps,
                    stats: result.stats
                }
            };

        } catch (error) {
            console.error('Upload error:', error);
            return { error: 'Failed to upload file: ' + error.message };
        }
    }

    async getFiles() {
        try {
            const files = await db.getData('/files');
            const fileList = Object.values(files || {}).map(file => ({
                id: file.id,
                name: file.originalName,
                size: file.size,
                type: file.mimetype,
                uploadDate: file.uploadDate,
                url: file.path
            }));

            return {
                count: fileList.length,
                files: fileList
            };

        } catch (error) {
            console.error('Get files error:', error);
            return { error: 'Failed to retrieve files' };
        }
    }

    async getFile(id) {
        try {
            const fileId = id;
            const file = await db.getData(`/files/${fileId}`);

            if (!file) {
                return { error: 'File not found' };
            }

            // Check if file exists on disk
            const fileStats = this.getFileStats(file.fullPath);
            if (!fileStats) {
                return { error: 'File not found on disk' };
            }

            return {
                id: file.id,
                name: file.originalName,
                filename: file.filename,
                size: file.size,
                type: file.mimetype,
                uploadDate: file.uploadDate,
                url: file.path,
                stats: fileStats
            };

        } catch (error) {
            console.error('Get file error:', error);
            if (error.message && error.message.includes('not found')) {
                return { error: 'File not found' };
            }
            return { error: 'Failed to retrieve file' };
        }
    }

    async deleteFile(id) {
        try {
            const fileId = id;
            const file = await db.getData(`/files/${fileId}`);

            if (!file) {
                console.log(`[FileController] File not found in database: ${fileId}`);
                return { error: 'File not found' };
            }

            console.log(`[FileController] Deleting file: ${file.filename}, fullPath: ${file.fullPath}`);

            // Delete file from disk using fullPath
            if (file.fullPath && fs.existsSync(file.fullPath)) {
                fs.unlinkSync(file.fullPath);
                console.log(`[FileController] Deleted file from disk: ${file.fullPath}`);
            } else {
                console.warn(`[FileController] File not found on disk: ${file.fullPath}`);
            }

            // Delete related vectors from Qdrant (best effort)
            try {
                const qdrant = require('./qdrant.controller');
                await qdrant.deleteByFileId(qdrant.collectionName, fileId);
                console.log(`[FileController] Deleted vectors for fileId: ${fileId}`);
            } catch (error) {
                console.warn(`[FileController] Failed to delete vectors: ${error.message}`);
            }

            // Delete from database
            await db.delete(`/files/${fileId}`);
            console.log(`[FileController] Deleted from database: ${fileId}`);

            return {
                message: 'File deleted successfully',
                deletedFile: {
                    id: fileId,
                    name: file.originalName
                }
            };

        } catch (error) {
            console.error('[FileController] Delete file error:', error);
            if (error.message && error.message.includes('not found')) {
                return { error: 'File not found' };
            }
            return { error: 'Failed to delete file: ' + error.message };
        }
    }

    // Utility for RAG: read file buffer by id
    async readFileBuffer(id) {
        try {
            const file = await db.getData(`/files/${id}`);
            if (!file) return { error: 'File not found' };
            if (!fs.existsSync(file.fullPath)) return { error: 'File not found on disk' };
            const buffer = fs.readFileSync(file.fullPath);
            return { buffer, meta: { fileId: id, filename: file.originalName, mimetype: file.mimetype } };
        } catch (error) {
            if (error.message && error.message.includes('not found')) {
                return { error: 'File not found' };
            }
            return { error: 'Failed to read file' };
        }
    }

    async downloadFile(id) {
        try {
            const fileId = id;
            const file = await db.getData(`/files/${fileId}`);

            if (!file) {
                return { error: 'File not found' };
            }

            // Check if file exists on disk
            if (!fs.existsSync(file.fullPath)) {
                return { error: 'File not found on disk' };
            }

            return { file };

        } catch (error) {
            console.error('Download file error:', error);
            if (error.message && error.message.includes('not found')) {
                return { error: 'File not found' };
            }
            return { error: 'Failed to download file' };
        }
    }
}

module.exports = new FileController();