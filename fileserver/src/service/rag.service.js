const { GoogleGenAI } = require('@google/genai');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { v5: uuidv5 } = require('uuid');
const fs = require('fs');
const os = require('os');
const path = require('path');
const qdrant = require('../controller/qdrant.controller');

// Namespace UUID for generating chunk IDs (random UUID, used as namespace)
const CHUNK_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

class RagService {
    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.warn('[RAG] GOOGLE_API_KEY is not set. Embedding will fail without it.');
        }
        this.genai = new GoogleGenAI({ apiKey: apiKey || '' });
        this.embeddingModelName = process.env.RAG_EMBEDDING_MODEL || 'gemini-embedding-001';
        this.collectionName = qdrant.collectionName;
        
        // Configurable chunking parameters
        this.chunkSize = parseInt(process.env.RAG_CHUNK_SIZE) || 800;
        this.chunkOverlap = parseInt(process.env.RAG_CHUNK_OVERLAP) || 100;
        this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
        this.embedBatchSize = parseInt(process.env.RAG_EMBED_BATCH_SIZE) || 64; // batch size for embedding calls
        
        console.log(`[RAG] Service ready. model=${this.embeddingModelName} collection=${this.collectionName}`);
        console.log(`[RAG] Chunking: size=${this.chunkSize}, overlap=${this.chunkOverlap}, maxFileSize=${this.maxFileSize}`);
        console.log(`[RAG] Embedding: batchSize=${this.embedBatchSize}, vectorSize=${Number(process.env.RAG_VECTOR_SIZE || 768)}`);
    }

    async extractText(buffer, mimetype, filename) {
        console.log(`[RAG] Extracting text mimetype=${mimetype} filename=${filename}`);
        if (mimetype === 'application/pdf' || (filename && filename.toLowerCase().endsWith('.pdf'))) {
            // Use LangChain PDFLoader only
            let tmpDir;
            let tmpPath;
            try {
                tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ragpdf-'));
                tmpPath = path.join(tmpDir, `upload.pdf`);
                fs.writeFileSync(tmpPath, buffer);
                const loader = new PDFLoader(tmpPath, { splitPages: false });
                const docs = await loader.load();
                const merged = (docs || []).map(d => d.pageContent || '').join('\n');
                if (merged && merged.trim()) return merged;
                throw new Error('PDFLoader returned empty content');
            } finally {
                try { if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
                try { if (tmpDir && fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir); } catch {}
            }
        }
        if (mimetype && mimetype.startsWith('text/')) {
            return buffer.toString('utf8');
        }
        // Fallback try utf8
        return buffer.toString('utf8');
    }

    chunkText(text, chunkSize = null, overlap = null) {
        const size = chunkSize || this.chunkSize;
        const overlapSize = overlap || this.chunkOverlap;
        
        const chunks = [];
        if (!text || !text.trim()) return chunks;
        const sanitized = text.replace(/\s+/g, ' ').trim();
        let start = 0;
        while (start < sanitized.length) {
            const end = Math.min(start + size, sanitized.length);
            const piece = sanitized.slice(start, end);
            chunks.push(piece);
            if (end === sanitized.length) break;
            start = end - overlapSize;
            if (start < 0) start = 0;
        }
        console.log(`[RAG] Chunked text into ${chunks.length} chunks (size=${size}, overlap=${overlapSize})`);
        return chunks;
    }

    async _embedBatch(textsBatch) {
        // Single API call for one batch of texts
        const response = await this.genai.models.embedContent({
            model: this.embeddingModelName,
            contents: textsBatch,
            // taskType is useful for similarity use-cases
            taskType: 'SEMANTIC_SIMILARITY',
            embeddingConfig: {
                outputDimensionality: Number(process.env.RAG_VECTOR_SIZE || 768),
            },
        });
        const embeddings = response.embeddings || response.Embeddings || [];
        return embeddings.map(e => {
            const values = e.values || (e.embedding && e.embedding.values) || [];
            const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
            return values.map(v => v / norm);
        });
    }

    async embedTexts(texts) {
        try {
            console.log(`[RAG] Embedding ${texts.length} texts with ${this.embeddingModelName} (batchSize=${this.embedBatchSize})`);
            if (!Array.isArray(texts) || texts.length === 0) return [];

            const batchSize = this.embedBatchSize > 0 ? this.embedBatchSize : 64;
            const vectors = [];
            for (let start = 0; start < texts.length; start += batchSize) {
                const end = Math.min(start + batchSize, texts.length);
                const batch = texts.slice(start, end);
                console.log(`[RAG] Embedding batch ${start / batchSize + 1} (${batch.length} items)`);
                const batchVectors = await this._embedBatch(batch);
                vectors.push(...batchVectors);
            }
            console.log('[RAG] Embedding complete');
            return vectors;
        } catch (error) {
            console.error(`[RAG] Error embedding texts:`, error.message);
            throw error;
        }
    }

    async ingestFileBuffer(buffer, meta) {
        const { fileId, filename, originalName, mimetype } = meta;
        console.log(`[RAG] Ingest start fileId=${fileId} filename=${filename}`);
        const text = await this.extractText(buffer, mimetype, filename);
        const chunks = this.chunkText(text);
        if (chunks.length === 0) {
            console.log('[RAG] No text extracted, skipping');
            return { inserted: 0 };
        }
        const embeddings = await this.embedTexts(chunks);
        const points = chunks.map((chunk, idx) => ({
            id: uuidv5(`${fileId}-chunk-${idx}`, CHUNK_NAMESPACE), // Generate valid UUID for Qdrant
            vector: embeddings[idx],
            payload: {
                fileId,
                filename,
                originalName: originalName || filename,
                chunk: idx,
                text: chunk,
            },
        }));
        console.log({points})
        const upsertResult = await qdrant.upsertPointsOneByOne(this.collectionName, points);
        console.log(`[RAG] Ingest done fileId=${fileId} inserted=${upsertResult.successCount}/${upsertResult.total}`);
        return { 
            inserted: upsertResult.successCount, 
            failed: upsertResult.failureCount,
            total: upsertResult.total,
            results: upsertResult.results
        };
    }

    async search(query, limit = 5, filter = undefined) {
        console.log(`[RAG] Search query='${(query||'').slice(0,64)}...' limit=${limit}`);
        const [vector] = await this.embedTexts([query]);
        const results = await qdrant.search(this.collectionName, vector, limit, filter);
        return results;
    }

    // Transactional file processing with rollback capability
    async processFileTransactionally(file, fileId, uploadPath) {
        const steps = [];
        let filePath = null;
        
        try {
            console.log(`[RAG] Starting transactional processing for fileId=${fileId}`);
            
            // Step 1: Save file to filesystem
            filePath = path.join(uploadPath, file.filename);
            fs.writeFileSync(filePath, file.buffer);
            steps.push({ step: 'file_save', path: filePath });
            console.log(`[RAG] Step 1: File saved to ${filePath}`);
            
            // Step 2: Extract text
            const text = await this.extractText(file.buffer, file.mimetype, file.originalname);
            if (!text || !text.trim()) {
                throw new Error('No text could be extracted from the file');
            }
            steps.push({ step: 'text_extraction', textLength: text.length });
            console.log(`[RAG] Step 2: Extracted ${text.length} characters of text`);
            
            // Step 3: Chunk text
            const chunks = this.chunkText(text);
            if (chunks.length === 0) {
                throw new Error('No chunks could be created from the text');
            }
            steps.push({ step: 'text_chunking', chunkCount: chunks.length });
            console.log(`[RAG] Step 3: Created ${chunks.length} chunks`);
            
            // Step 4: Generate embeddings
            const embeddings = await this.embedTexts(chunks);
            if (embeddings.length !== chunks.length) {
                throw new Error('Embedding count does not match chunk count');
            }
            steps.push({ step: 'embeddings', embeddingCount: embeddings.length });
            console.log(`[RAG] Step 4: Generated ${embeddings.length} embeddings`);
            
            // Step 5: Store in vector database
            const points = chunks.map((chunk, idx) => ({
                id: uuidv5(`${fileId}-chunk-${idx}`, CHUNK_NAMESPACE), // Generate valid UUID for Qdrant
                vector: embeddings[idx],
                payload: {
                    fileId,
                    filename: file.filename,
                    originalName: file.originalname,
                    chunk: idx,
                    text: chunk,
                    mimetype: file.mimetype,
                    size: file.size
                },
            }));
            
            const upsertResult = await qdrant.upsertPointsOneByOne(this.collectionName, points);
            
            if (upsertResult.failureCount > 0) {
                throw new Error(`Failed to upsert ${upsertResult.failureCount}/${upsertResult.total} vectors`);
            }
            
            steps.push({ 
                step: 'vector_storage', 
                pointCount: upsertResult.successCount,
                failedCount: upsertResult.failureCount,
                totalCount: upsertResult.total
            });
            console.log(`[RAG] Step 5: Stored ${upsertResult.successCount}/${upsertResult.total} vectors in database`);
            
            console.log(`[RAG] Transaction completed successfully for fileId=${fileId}`);
            return {
                success: true,
                fileId,
                steps,
                stats: {
                    textLength: text.length,
                    chunkCount: chunks.length,
                    vectorCount: points.length
                }
            };
            
        } catch (error) {
            console.error(`[RAG] Transaction failed for fileId=${fileId}:`, error.message);
            
            // Rollback: Clean up any created resources
            await this.rollbackTransaction(fileId, steps, filePath);
            
            return {
                success: false,
                error: error.message,
                fileId,
                steps
            };
        }
    }

    async rollbackTransaction(fileId, steps, filePath) {
        console.log(`[RAG] Rolling back transaction for fileId=${fileId}`);
        
        try {
            // Remove vectors from Qdrant
            if (steps.some(s => s.step === 'vector_storage')) {
                await qdrant.deleteByFileId(this.collectionName, fileId);
                console.log(`[RAG] Rollback: Removed vectors for fileId=${fileId}`);
            }
        } catch (error) {
            console.error(`[RAG] Rollback error removing vectors:`, error.message);
        }
        
        try {
            // Remove file from filesystem
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[RAG] Rollback: Removed file ${filePath}`);
            }
        } catch (error) {
            console.error(`[RAG] Rollback error removing file:`, error.message);
        }
    }
}

module.exports = new RagService();


