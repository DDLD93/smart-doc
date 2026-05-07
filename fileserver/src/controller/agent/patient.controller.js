'use strict';

const prisma = require('../../db/prisma');

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

function parseIntParam(value, fallback) {
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : fallback;
}

function paginate(query) {
    const take = Math.min(Math.max(parseIntParam(query.take, DEFAULT_TAKE), 1), MAX_TAKE);
    const skip = Math.max(parseIntParam(query.skip, 0), 0);
    return { take, skip };
}

function parseDateRange(query) {
    const range = {};
    if (query.from) {
        const d = new Date(query.from);
        if (!isNaN(d.getTime())) range.gte = d;
    }
    if (query.to) {
        const d = new Date(query.to);
        if (!isNaN(d.getTime())) range.lte = d;
    }
    return Object.keys(range).length ? range : undefined;
}

const NOT_DELETED = { deletedAt: null };

async function ensurePatientExists(patientId) {
    const exists = await prisma.patient.findFirst({
        where: { id: patientId, deletedAt: null },
        select: { id: true },
    });
    return Boolean(exists);
}

class AgentPatientController {
    async listPatients(req, res) {
        try {
            const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            const { take, skip } = paginate(req.query);

            const where = {
                deletedAt: null,
                ...(q
                    ? {
                          OR: [
                              { medicalRecordNumber: { contains: q, mode: 'insensitive' } },
                              { firstName: { contains: q, mode: 'insensitive' } },
                              { middleName: { contains: q, mode: 'insensitive' } },
                              { lastName: { contains: q, mode: 'insensitive' } },
                          ],
                      }
                    : {}),
            };

            const [patients, total] = await Promise.all([
                prisma.patient.findMany({
                    where,
                    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                    take,
                    skip,
                    select: {
                        id: true,
                        medicalRecordNumber: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                        dateOfBirth: true,
                        sex: true,
                        deceased: true,
                    },
                }),
                prisma.patient.count({ where }),
            ]);

            res.json({ patients, total, take, skip });
        } catch (err) {
            console.error('[Agent/Patient] listPatients failed:', err);
            res.status(500).json({ error: 'Failed to list patients' });
        }
    }

    async getPatientByMrn(req, res) {
        try {
            const mrn = req.params.mrn;
            if (!mrn) return res.status(400).json({ error: 'mrn is required' });
            const patient = await prisma.patient.findFirst({
                where: { medicalRecordNumber: mrn, deletedAt: null },
            });
            if (!patient) return res.status(404).json({ error: 'Patient not found' });
            res.json(patient);
        } catch (err) {
            console.error('[Agent/Patient] getPatientByMrn failed:', err);
            res.status(500).json({ error: 'Failed to lookup patient' });
        }
    }

    async getPatientSummary(req, res) {
        try {
            const patient = await prisma.patient.findFirst({
                where: { id: req.params.id, deletedAt: null },
                include: {
                    _count: {
                        select: {
                            encounters: true,
                            allergies: true,
                            medicalHistory: true,
                            carePlans: true,
                            immunizations: true,
                            observations: true,
                        },
                    },
                },
            });
            if (!patient) return res.status(404).json({ error: 'Patient not found' });
            res.json(patient);
        } catch (err) {
            console.error('[Agent/Patient] getPatientSummary failed:', err);
            res.status(500).json({ error: 'Failed to load patient' });
        }
    }

    async getEncounters(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const { take, skip } = paginate(req.query);
            const dateRange = parseDateRange(req.query);

            const where = {
                patientId,
                deletedAt: null,
                ...(dateRange ? { encounterDateTime: dateRange } : {}),
            };

            const [encounters, total] = await Promise.all([
                prisma.encounter.findMany({
                    where,
                    orderBy: { encounterDateTime: 'desc' },
                    take,
                    skip,
                    select: {
                        id: true,
                        encounterType: true,
                        encounterDateTime: true,
                        chiefComplaint: true,
                        clinicalSummary: true,
                        attendingClinicianId: true,
                        disposition: true,
                    },
                }),
                prisma.encounter.count({ where }),
            ]);

            res.json({ patientId, encounters, total, take, skip });
        } catch (err) {
            console.error('[Agent/Patient] getEncounters failed:', err);
            res.status(500).json({ error: 'Failed to list encounters' });
        }
    }

    async getAllergies(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const allergies = await prisma.allergy.findMany({
                where: { patientId, ...NOT_DELETED },
                orderBy: { createdAt: 'desc' },
            });
            res.json({ patientId, total: allergies.length, allergies });
        } catch (err) {
            console.error('[Agent/Patient] getAllergies failed:', err);
            res.status(500).json({ error: 'Failed to load allergies' });
        }
    }

    async getMedicalHistory(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const items = await prisma.medicalHistory.findMany({
                where: { patientId, ...NOT_DELETED },
                orderBy: [{ diagnosisDate: 'desc' }, { createdAt: 'desc' }],
            });
            res.json({ patientId, total: items.length, history: items });
        } catch (err) {
            console.error('[Agent/Patient] getMedicalHistory failed:', err);
            res.status(500).json({ error: 'Failed to load medical history' });
        }
    }

    async getCarePlans(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const carePlans = await prisma.carePlan.findMany({
                where: { patientId, ...NOT_DELETED },
                orderBy: { createdAt: 'desc' },
                include: {
                    diagnosis: {
                        select: {
                            id: true,
                            diagnosisCode: true,
                            diagnosisName: true,
                            diagnosisType: true,
                            certainty: true,
                        },
                    },
                },
            });
            res.json({ patientId, total: carePlans.length, carePlans });
        } catch (err) {
            console.error('[Agent/Patient] getCarePlans failed:', err);
            res.status(500).json({ error: 'Failed to load care plans' });
        }
    }

    async getImmunizations(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const immunizations = await prisma.immunization.findMany({
                where: { patientId, ...NOT_DELETED },
                orderBy: { administrationDate: 'desc' },
            });
            res.json({ patientId, total: immunizations.length, immunizations });
        } catch (err) {
            console.error('[Agent/Patient] getImmunizations failed:', err);
            res.status(500).json({ error: 'Failed to load immunizations' });
        }
    }

    async getObservations(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const { take, skip } = paginate(req.query);
            const observations = await prisma.observation.findMany({
                where: { patientId, ...NOT_DELETED },
                orderBy: { observedAt: 'desc' },
                take,
                skip,
            });
            res.json({ patientId, total: observations.length, take, skip, observations });
        } catch (err) {
            console.error('[Agent/Patient] getObservations failed:', err);
            res.status(500).json({ error: 'Failed to load observations' });
        }
    }

    async getMedications(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const dateRange = parseDateRange(req.query);
            const medications = await prisma.medication.findMany({
                where: {
                    deletedAt: null,
                    encounter: {
                        patientId,
                        deletedAt: null,
                        ...(dateRange ? { encounterDateTime: dateRange } : {}),
                    },
                },
                orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
                include: {
                    encounter: {
                        select: { id: true, encounterDateTime: true, encounterType: true },
                    },
                },
            });
            res.json({ patientId, total: medications.length, medications });
        } catch (err) {
            console.error('[Agent/Patient] getMedications failed:', err);
            res.status(500).json({ error: 'Failed to load medications' });
        }
    }

    async getLabResults(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const dateRange = parseDateRange(req.query);
            const results = await prisma.labResult.findMany({
                where: {
                    deletedAt: null,
                    labOrder: {
                        deletedAt: null,
                        encounter: {
                            patientId,
                            deletedAt: null,
                            ...(dateRange ? { encounterDateTime: dateRange } : {}),
                        },
                    },
                },
                orderBy: { resultedAt: 'desc' },
                include: {
                    labOrder: {
                        select: {
                            id: true,
                            testCode: true,
                            testName: true,
                            specimenType: true,
                            priority: true,
                            orderedAt: true,
                            encounter: {
                                select: { id: true, encounterDateTime: true, encounterType: true },
                            },
                        },
                    },
                },
            });
            res.json({ patientId, total: results.length, labResults: results });
        } catch (err) {
            console.error('[Agent/Patient] getLabResults failed:', err);
            res.status(500).json({ error: 'Failed to load lab results' });
        }
    }

    async getVitals(req, res) {
        try {
            const patientId = req.params.id;
            if (!(await ensurePatientExists(patientId))) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            const dateRange = parseDateRange(req.query);
            const vitals = await prisma.vitalSigns.findMany({
                where: {
                    deletedAt: null,
                    ...(dateRange ? { recordedAt: dateRange } : {}),
                    encounter: {
                        patientId,
                        deletedAt: null,
                    },
                },
                orderBy: { recordedAt: 'desc' },
                include: {
                    encounter: {
                        select: { id: true, encounterDateTime: true, encounterType: true },
                    },
                },
            });
            res.json({ patientId, total: vitals.length, vitals });
        } catch (err) {
            console.error('[Agent/Patient] getVitals failed:', err);
            res.status(500).json({ error: 'Failed to load vitals' });
        }
    }

    async getEncounter(req, res) {
        try {
            const id = req.params.id;
            const encounter = await prisma.encounter.findFirst({
                where: { id, deletedAt: null },
                include: {
                    patient: {
                        select: {
                            id: true,
                            medicalRecordNumber: true,
                            firstName: true,
                            middleName: true,
                            lastName: true,
                            sex: true,
                            dateOfBirth: true,
                        },
                    },
                    symptoms: { where: NOT_DELETED, orderBy: { createdAt: 'desc' } },
                    vitals: { where: NOT_DELETED, orderBy: { recordedAt: 'desc' } },
                    diagnoses: { where: NOT_DELETED, orderBy: { diagnosedAt: 'desc' } },
                    clinicalNotes: { where: NOT_DELETED, orderBy: { createdAt: 'desc' } },
                    medications: { where: NOT_DELETED, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }] },
                    labOrders: {
                        where: NOT_DELETED,
                        orderBy: { orderedAt: 'desc' },
                        include: { results: { where: NOT_DELETED, orderBy: { resultedAt: 'desc' } } },
                    },
                    imagingOrders: {
                        where: NOT_DELETED,
                        orderBy: { orderedAt: 'desc' },
                        include: { reports: { where: NOT_DELETED, orderBy: { reportedAt: 'desc' } } },
                    },
                    procedures: { where: NOT_DELETED, orderBy: { performedAt: 'desc' } },
                    outcomes: { where: NOT_DELETED, orderBy: { recordedAt: 'desc' } },
                    observations: { where: NOT_DELETED, orderBy: { observedAt: 'desc' } },
                },
            });
            if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
            res.json(encounter);
        } catch (err) {
            console.error('[Agent/Patient] getEncounter failed:', err);
            res.status(500).json({ error: 'Failed to load encounter' });
        }
    }
}

module.exports = new AgentPatientController();
