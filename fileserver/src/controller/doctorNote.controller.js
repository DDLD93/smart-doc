'use strict';

const { v4: uuidv4 } = require('uuid');
const ragService = require('../service/rag.service');
const qdrant = require('./qdrant.controller');

const COLLECTION = () => process.env.QDRANT_DOCTOR_NOTES_COLLECTION || 'doctor_notes';

class DoctorNoteController {
    async createNote(req, res) {
        const { id: patientId } = req.params;
        const { encounterId, noteText, noteType = 'DOCTORS_NOTE' } = req.body;

        if (!patientId || !encounterId || !noteText?.trim()) {
            return res.status(400).json({ error: 'patientId, encounterId and noteText are required' });
        }

        let vector;
        try {
            const vectors = await ragService.embedTexts([noteText.trim()]);
            vector = vectors[0];
        } catch (err) {
            console.error('[DoctorNote] Embedding failed:', err.message);
            return res.status(500).json({ error: 'Embedding failed' });
        }

        if (!vector?.length) {
            return res.status(500).json({ error: 'Embedding returned empty vector' });
        }

        const pointId = uuidv4();
        const createdAt = new Date().toISOString();

        await qdrant.upsertPoints(COLLECTION(), [{
            id: pointId,
            vector,
            payload: { patientId, encounterId, noteText: noteText.trim(), noteType, createdAt },
        }]);

        console.log(`[DoctorNote] Saved note ${pointId} for patient=${patientId} encounter=${encounterId}`);
        res.status(201).json({ id: pointId, patientId, encounterId, noteType, createdAt });
    }

    async getNotes(req, res) {
        const { id: patientId } = req.params;
        const { encounterId } = req.query;

        const points = await qdrant.scrollDoctorNotes(patientId, encounterId || null);
        points.sort((a, b) => (b.payload?.createdAt || '').localeCompare(a.payload?.createdAt || ''));
        res.json(points.map(pt => ({ id: pt.id, ...pt.payload })));
    }
}

module.exports = new DoctorNoteController();
