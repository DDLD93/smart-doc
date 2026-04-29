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
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.warn('[RAG] GOOGLE_GENERATIVE_AI_API_KEY is not set. Embedding will fail without it.');
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

    async embedTexts(texts, onProgress) {
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
                if (onProgress) {
                    const percentage = 60 + Math.round((vectors.length / texts.length) * 20);
                    onProgress({
                        step: 'embed',
                        status: 'active',
                        percentage,
                        message: `Generated ${vectors.length}/${texts.length} embeddings`,
                    });
                }
            }
            console.log('[RAG] Embedding complete');
            return vectors;
        } catch (error) {
            console.error(`[RAG] Error embedding texts:`, error.message);
            throw error;
        }
    }

    async ingestFileBuffer(buffer, meta, onProgress, options = {}) {
        const { fileId, filename, originalName, mimetype } = meta;
        console.log(`[RAG] Ingest start fileId=${fileId} filename=${filename}`);
        if (onProgress) {
            onProgress({ step: 'extract', status: 'active', percentage: 30, message: 'Extracting text from document' });
        }
        const text = await this.extractText(buffer, mimetype, filename);
        if (onProgress) {
            onProgress({ step: 'extract', status: 'completed', percentage: 45, message: `Extracted ${text.length} characters` });
            onProgress({ step: 'chunk', status: 'active', percentage: 50, message: 'Creating chunks' });
        }
        const chunks = this.chunkText(text, options.chunkSize, options.chunkOverlap);
        if (chunks.length === 0) {
            console.log('[RAG] No text extracted, skipping');
            return { inserted: 0 };
        }
        if (onProgress) {
            onProgress({ step: 'chunk', status: 'completed', percentage: 60, message: `Created ${chunks.length} chunks` });
            onProgress({ step: 'embed', status: 'active', percentage: 60, message: 'Generating embeddings' });
        }
        const embeddings = await this.embedTexts(chunks, onProgress);
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
        if (onProgress) {
            onProgress({ step: 'embed', status: 'completed', percentage: 80, message: `Generated ${embeddings.length} embeddings` });
            onProgress({ step: 'store', status: 'active', percentage: 85, message: 'Storing vectors' });
        }
        const upsertResult = await qdrant.upsertPointsOneByOne(this.collectionName, points);
        console.log(`[RAG] Ingest done fileId=${fileId} inserted=${upsertResult.successCount}/${upsertResult.total}`);
        if (onProgress) {
            onProgress({ step: 'store', status: 'completed', percentage: 100, message: `Stored ${upsertResult.successCount} vectors` });
        }
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

}

module.exports = new RagService();


