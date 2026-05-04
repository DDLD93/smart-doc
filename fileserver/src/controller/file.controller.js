const { v4: uuidv4 } = require('uuid');
const prisma = require('../db/prisma');
const s3Storage = require('../storage/s3Storage');
const { queueIngestJob } = require('../jobs/ingestProducer');

class FileController {
    constructor() {}

    async addFile(file, data) {
        try {
            if (!file) {
                return { error: 'No file uploaded' };
            }

            const fileId = uuidv4().replace(/-/g, '');
            const objectKey = s3Storage.buildObjectKey(fileId, file.originalname);
            const uploaded = await s3Storage.putObject({
                objectKey,
                buffer: file.buffer,
                mimeType: file.mimetype,
            });

            let savedFile = null;
            try {
                savedFile = await prisma.fileAsset.create({
                    data: {
                        id: fileId,
                        originalName: file.originalname,
                        filename: file.originalname,
                        mimeType: file.mimetype,
                        sizeBytes: BigInt(file.size),
                        bucket: uploaded.bucket,
                        objectKey: uploaded.objectKey,
                        fileUrl: uploaded.fileUrl,
                        checksumSha256: uploaded.checksumSha256,
                        status: 'PENDING_INGEST',
                    },
                });
            } catch (error) {
                await s3Storage.deleteObject(uploaded.objectKey);
                throw error;
            }

            const chunkSize = Number(data.chunkSize || process.env.RAG_CHUNK_SIZE || 800);
            const chunkOverlap = Number(data.chunkOverlap || process.env.RAG_CHUNK_OVERLAP || 100);
            const job = await queueIngestJob({
                fileId,
                chunkSize,
                chunkOverlap,
            });

            console.log(`[FileController] Upload queued for fileId=${fileId}, jobId=${job.id}`);
            return {
                message: 'File uploaded successfully. Ingestion queued.',
                file: {
                    id: savedFile.id,
                    name: savedFile.originalName,
                    size: Number(savedFile.sizeBytes),
                    type: savedFile.mimeType,
                    uploadDate: savedFile.uploadedAt,
                    status: savedFile.status,
                    url: savedFile.fileUrl,
                }
                ,
                job: {
                    id: job.id,
                    status: job.status,
                },
            };

        } catch (error) {
            console.error('Upload error:', error);
            return { error: 'Failed to upload file: ' + error.message };
        }
    }

    async getFiles() {
        try {
            const files = await prisma.fileAsset.findMany({
                where: { status: { not: 'DELETED' } },
                orderBy: { uploadedAt: 'desc' },
                include: {
                    jobs: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
            });

            const fileList = files.map((file) => ({
                id: file.id,
                name: file.originalName,
                size: Number(file.sizeBytes),
                type: file.mimeType,
                uploadDate: file.uploadedAt,
                url: file.fileUrl,
                status: file.status,
                latestJob: file.jobs[0] || null,
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
            const file = await prisma.fileAsset.findUnique({
                where: { id },
                include: {
                    jobs: {
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                    },
                },
            });

            if (!file) {
                return { error: 'File not found' };
            }

            return {
                id: file.id,
                name: file.originalName,
                filename: file.filename,
                size: Number(file.sizeBytes),
                type: file.mimeType,
                uploadDate: file.uploadedAt,
                url: file.fileUrl,
                status: file.status,
                jobs: file.jobs,
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
            const file = await prisma.fileAsset.findUnique({
                where: { id },
            });

            if (!file) {
                console.log(`[FileController] File not found in database: ${id}`);
                return { error: 'File not found' };
            }

            // Remove vectors from Qdrant (best effort)
            try {
                const qdrant = require('./qdrant.controller');
                await qdrant.deleteByFileId(qdrant.collectionName, id);
                console.log(`[FileController] Deleted vectors for fileId: ${id}`);
            } catch (error) {
                console.warn(`[FileController] Failed to delete vectors: ${error.message}`);
            }

            // Remove object from S3 (best effort)
            try {
                console.log(`[FileController] Deleting file object: ${file.objectKey}`);
                await s3Storage.deleteObject(file.objectKey);
            } catch (error) {
                console.warn(`[FileController] Failed to delete S3 object: ${error.message}`);
            }

            // Hard delete from DB (cascades to ingest_jobs and ingest_attempts)
            await prisma.fileAsset.delete({
                where: { id },
            });
            console.log(`[FileController] Permanently deleted file record: ${id}`);

            return {
                message: 'File permanently deleted',
                deletedFile: {
                    id,
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

    async downloadFile(id) {
        try {
            const file = await prisma.fileAsset.findUnique({
                where: { id },
            });

            if (!file) {
                return { error: 'File not found' };
            }

            const signedUrl = await s3Storage.getDownloadUrl(file.objectKey);

            return {
                file: {
                    id: file.id,
                    originalName: file.originalName,
                    path: signedUrl,
                },
            };

        } catch (error) {
            console.error('Download file error:', error);
            if (error.message && error.message.includes('not found')) {
                return { error: 'File not found' };
            }
            return { error: 'Failed to download file' };
        }
    }

    async getJobs(fileId) {
        const jobs = await prisma.ingestJob.findMany({
            where: { fileId },
            include: {
                attempts: {
                    orderBy: { attemptNo: 'desc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return { jobs };
    }

    async getJob(jobId) {
        const job = await prisma.ingestJob.findUnique({
            where: { id: jobId },
            include: {
                attempts: { orderBy: { attemptNo: 'desc' } },
                file: true,
            },
        });
        if (!job) {
            return { error: 'Job not found' };
        }
        return { job };
    }
}

module.exports = new FileController();