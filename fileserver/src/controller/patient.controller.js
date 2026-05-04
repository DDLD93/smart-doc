const prisma = require('../db/prisma');

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

function parseIntParam(value, fallback) {
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) ? n : fallback;
}

class PatientController {
    async listPatients(query) {
        const q = typeof query.q === 'string' ? query.q.trim() : '';
        const take = Math.min(
            Math.max(parseIntParam(query.take, DEFAULT_TAKE), 1),
            MAX_TAKE
        );
        const skip = Math.max(parseIntParam(query.skip, 0), 0);

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

        return { patients, total, take, skip };
    }

    async getPatient(id) {
        if (!id || typeof id !== 'string') {
            return { error: 'Invalid patient id', status: 400 };
        }

        const patient = await prisma.patient.findFirst({
            where: { id, deletedAt: null },
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

        if (!patient) {
            return { error: 'Patient not found', status: 404 };
        }

        return { patient };
    }
}

module.exports = new PatientController();
