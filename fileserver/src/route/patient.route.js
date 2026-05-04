const express = require('express');
const patientController = require('../controller/patient.controller');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await patientController.listPatients(req.query);
        res.json(result);
    } catch (err) {
        console.error('[API] GET /api/patients failed:', err);
        res.status(500).json({ error: 'Failed to list patients' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const result = await patientController.getPatient(req.params.id);
        if (result.error) {
            return res.status(result.status || 500).json({ error: result.error });
        }
        res.json(result.patient);
    } catch (err) {
        console.error('[API] GET /api/patients/:id failed:', err);
        res.status(500).json({ error: 'Failed to load patient' });
    }
});

module.exports = router;
