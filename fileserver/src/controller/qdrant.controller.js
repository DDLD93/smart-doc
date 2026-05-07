const { QdrantClient } = require('@qdrant/js-client-rest');

class QdrantController {
    constructor() {
        this.client = null;
        this.collectionName = process.env.QDRANT_COLLECTION || 'documents';
        this.vectorSize = Number(process.env.RAG_VECTOR_SIZE || 768); // Gemini text-embedding-004
        this.distance = process.env.RAG_VECTOR_DISTANCE || 'Cosine';
        console.log('[Qdrant] Controller constructing...');
        this._initClient().catch(error => {
            console.error('[Qdrant] Error connecting to Qdrant:', error);
        });
    }

    async _initClient() {
        const url = process.env.QDRANT_URL;
        const apiKey = process.env.QDRANT_API_KEY || undefined;
        console.log(`[Qdrant] Initializing client URL=${url} auth=${apiKey ? 'yes' : 'no'}`);
        this.client = new QdrantClient({ url, apiKey, checkCompatibility: false });
        await this.ensureCollection(this.collectionName, this.vectorSize, this.distance);
        await this.ensureDoctorNotesCollection();
    }

    async ensureCollection(collectionName, vectorSize, distance) {
        try {
            const collections = await this.client.getCollections();
            const names = (collections?.collections || []).map(c => c.name);
            if (!names.includes(collectionName)) {
                console.log(`[Qdrant] Creating collection ${collectionName} size=${vectorSize} distance=${distance}`);
                await this.client.createCollection(collectionName, {
                    vectors: { size: vectorSize, distance },
                    optimizers_config: { default_segment_number: 2 },
                });
                await this._createDefaultPayloadIndexes(collectionName);
            } else {
                console.log(`[Qdrant] Collection ${collectionName} already exists`);
            }
        } catch (error) {
            console.warn('[Qdrant] ensureCollection error, attempting to create indexes anyway:', error?.message || error);
            await this._createDefaultPayloadIndexes(collectionName).catch(() => {});
        }
    }

    async _createDefaultPayloadIndexes(collectionName) {
        console.log(`[Qdrant] Ensuring payload indexes for ${collectionName}`);
        const indexDefs = [
            { field_name: 'fileId', field_schema: 'keyword' },
            { field_name: 'filename', field_schema: 'keyword' },
            { field_name: 'originalName', field_schema: 'keyword' },
            { field_name: 'chunk', field_schema: 'integer' },
            { field_name: 'page', field_schema: 'integer' },
        ];
        for (const def of indexDefs) {
            try {
                await this.client.createPayloadIndex(collectionName, { ...def, wait: true });
                console.log(`[Qdrant] Index ensured: ${def.field_name} (${def.field_schema})`);
            } catch (_) {
                // Ignore if already exists
            }
        }
    }

    async upsertPoints(collectionName, points) {
        console.log(`[Qdrant] Upserting ${points.length} points into ${collectionName}`);
        return await this.client.upsert(collectionName, { points, wait: true });
    }

    async upsertPointsOneByOne(collectionName, points) {
        console.log(`[Qdrant] Upserting ${points.length} points one by one into ${collectionName}`);
        const results = [];
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < points.length; i++) {
            try {
                console.log(`[Qdrant] Upserting point ${i} (id: ${points[i].id})`);
                await this.client.upsert(collectionName, { 
                    points: [points[i]], 
                    wait: true 
                });
                console.log(`[Qdrant] Point ${i} (id: ${points[i].id}) upserted successfully`);
                successCount++;
                results.push({ index: i, success: true, pointId: points[i].id });
                
                // Log progress every 10 points or at the end
                if ((i + 1) % 10 === 0 || i === points.length - 1) {
                    console.log(`[Qdrant] Progress: ${i + 1}/${points.length} points processed (✓${successCount} ✗${failureCount})`);
                }
            } catch (error) {
                failureCount++;
                const errorMsg = error?.data?.status?.error || error?.message || String(error);
                console.error(`[Qdrant] Failed to upsert point ${i} (id: ${points[i].id}):`, errorMsg);
                results.push({ 
                    index: i, 
                    success: false, 
                    pointId: points[i].id, 
                    error: errorMsg
                });
            }
        }

        console.log(`[Qdrant] Upsert complete: ${successCount} succeeded, ${failureCount} failed`);
        return { 
            successCount, 
            failureCount, 
            total: points.length,
            results 
        };
    }

    async search(collectionName, vector, limit, filter) {
        console.log(`[Qdrant] Search vector len=${vector?.length || 0} limit=${limit} filter=${filter ? 'yes' : 'no'}`);
        return this.client.search(collectionName, { vector, limit, filter });
    }

    async deleteByFileId(collectionName, fileId) {
        console.log(`[Qdrant] Deleting by fileId=${fileId} in ${collectionName}`);
        return this.client.delete(collectionName, {
            filter: { must: [{ key: 'fileId', match: { value: fileId } }] },
            wait: true,
        });
    }

    async ensureDoctorNotesCollection() {
        const name = process.env.QDRANT_DOCTOR_NOTES_COLLECTION || 'doctor_notes';
        await this.ensureCollection(name, this.vectorSize, this.distance);
        for (const def of [
            { field_name: 'patientId',   field_schema: 'keyword' },
            { field_name: 'encounterId', field_schema: 'keyword' },
            { field_name: 'createdAt',   field_schema: 'keyword' },
        ]) {
            try { await this.client.createPayloadIndex(name, { ...def, wait: true }); } catch (_) {}
        }
        return name;
    }

    async scrollDoctorNotes(patientId, encounterId = null) {
        const name = process.env.QDRANT_DOCTOR_NOTES_COLLECTION || 'doctor_notes';
        const must = [{ key: 'patientId', match: { value: patientId } }];
        if (encounterId) must.push({ key: 'encounterId', match: { value: encounterId } });
        const res = await this.client.scroll(name, {
            filter: { must },
            with_payload: true,
            with_vector: false,
            limit: 200,
        });
        return res?.points || [];
    }

    async countByFileId(collectionName, fileId) {
        console.log(`[Qdrant] Counting vectors for fileId=${fileId}`);
        const res = await this.client.count(collectionName, {
            exact: true,
            filter: { must: [{ key: 'fileId', match: { value: fileId } }] },
        });
        // res.result.count
        return res?.result?.count || 0;
    }
}

module.exports = new QdrantController();