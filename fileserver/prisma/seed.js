'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dt(isoString) {
  return new Date(isoString);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const PATIENTS = [
  {
    medicalRecordNumber: 'MRN-2024-0001',
    firstName: 'Amara',
    middleName: 'Chisom',
    lastName: 'Okafor',
    dateOfBirth: dt('1985-03-14'),
    sex: 'FEMALE',
    bloodGroup: 'O_POS',
    genotype: 'AS',
    baselineHeightCm: 163.0,
    baselineWeightKg: 68.5,
    deceased: false,
    organDonor: true,
  },
  {
    medicalRecordNumber: 'MRN-2024-0002',
    firstName: 'Emeka',
    middleName: 'Tobechukwu',
    lastName: 'Nwachukwu',
    dateOfBirth: dt('1972-11-02'),
    sex: 'MALE',
    bloodGroup: 'A_POS',
    genotype: 'AA',
    baselineHeightCm: 178.0,
    baselineWeightKg: 84.0,
    deceased: false,
    organDonor: false,
  },
  {
    medicalRecordNumber: 'MRN-2024-0003',
    firstName: 'Fatima',
    lastName: 'Bello',
    dateOfBirth: dt('1990-07-19'),
    sex: 'FEMALE',
    bloodGroup: 'B_POS',
    genotype: 'AC',
    baselineHeightCm: 158.0,
    baselineWeightKg: 57.0,
    deceased: false,
    organDonor: null,
  },
];

// ---------------------------------------------------------------------------

async function seedPatient(patientData) {
  const patient = await prisma.patient.create({ data: patientData });
  console.log(`  Created patient: ${patient.firstName} ${patient.lastName} (${patient.id})`);

  // -- Allergies -------------------------------------------------------
  await prisma.allergy.createMany({
    data: [
      {
        patientId: patient.id,
        allergen: 'Penicillin',
        reaction: 'Urticaria and angioedema',
        severity: 'HIGH',
        onsetDate: dt('2010-06-01'),
        status: 'ACTIVE',
      },
      {
        patientId: patient.id,
        allergen: 'Sulfonamides',
        reaction: 'Maculopapular rash',
        severity: 'MODERATE',
        status: 'RESOLVED',
      },
    ],
  });

  // -- Medical history -------------------------------------------------
  await prisma.medicalHistory.createMany({
    data: [
      {
        patientId: patient.id,
        conditionCode: 'E11',
        conditionName: 'Type 2 Diabetes Mellitus',
        diagnosisDate: dt('2018-01-15'),
        chronicity: 'CHRONIC',
        familyHistory: true,
      },
      {
        patientId: patient.id,
        conditionCode: 'I10',
        conditionName: 'Essential Hypertension',
        diagnosisDate: dt('2019-05-20'),
        chronicity: 'CHRONIC',
        familyHistory: true,
      },
    ],
  });

  // -- Immunizations ---------------------------------------------------
  await prisma.immunization.createMany({
    data: [
      {
        patientId: patient.id,
        vaccineCode: 'COVID19',
        vaccineName: 'COVID-19 mRNA Vaccine (Moderna)',
        doseNumber: 2,
        administrationDate: dt('2022-03-10'),
      },
      {
        patientId: patient.id,
        vaccineCode: 'YF',
        vaccineName: 'Yellow Fever Vaccine',
        doseNumber: 1,
        administrationDate: dt('2015-08-22'),
      },
    ],
  });

  // -- Observations (patient-level) ------------------------------------
  await prisma.observation.createMany({
    data: [
      {
        patientId: patient.id,
        observationType: 'BMI',
        value: '25.8',
        unit: 'kg/m²',
        interpretation: 'Normal',
        observedAt: dt('2024-01-10T08:00:00Z'),
      },
      {
        patientId: patient.id,
        observationType: 'Smoking Status',
        observationCode: 'SMOK',
        value: 'Never smoker',
        observedAt: dt('2024-01-10T08:00:00Z'),
      },
    ],
  });

  // -- Encounters ------------------------------------------------------
  const encounters = await Promise.all([
    prisma.encounter.create({
      data: {
        patientId: patient.id,
        encounterType: 'OUTPATIENT',
        encounterDateTime: dt('2024-02-05T09:30:00Z'),
        chiefComplaint: 'Persistent cough and shortness of breath for 5 days',
        clinicalSummary: 'Patient presents with productive cough, low-grade fever, and mild dyspnoea.',
        disposition: 'DISCHARGED',
      },
    }),
    prisma.encounter.create({
      data: {
        patientId: patient.id,
        encounterType: 'EMERGENCY',
        encounterDateTime: dt('2024-08-18T22:15:00Z'),
        chiefComplaint: 'Severe chest pain radiating to left arm',
        clinicalSummary: 'Patient admitted with acute chest pain. ECG performed urgently.',
        disposition: 'ADMITTED',
      },
    }),
  ]);

  for (const encounter of encounters) {
    await seedEncounter(patient, encounter);
  }

  // -- Care plan (linked to first encounter's diagnosis) ----------------
  const firstDiagnosis = await prisma.diagnosis.findFirst({
    where: { encounterId: encounters[0].id },
  });

  await prisma.carePlan.create({
    data: {
      patientId: patient.id,
      diagnosisId: firstDiagnosis?.id ?? null,
      goals: [
        'Resolve acute respiratory symptoms within 2 weeks',
        'Maintain blood glucose within target range',
        'Blood pressure < 130/80 mmHg',
      ],
      interventions: [
        'Prescribe amoxicillin-clavulanate 625 mg BD for 7 days',
        'Continue metformin 500 mg BD',
        'Low-sodium diet counselling',
        'Follow-up in 2 weeks',
      ],
      monitoringPlan: 'Weekly BP and blood glucose checks. Repeat CXR at 4 weeks if symptoms persist.',
      reviewDate: dt('2024-03-05'),
      status: 'ACTIVE',
    },
  });

  console.log(`  Seeded full clinical record for ${patient.firstName} ${patient.lastName}`);
}

// ---------------------------------------------------------------------------

async function seedEncounter(patient, encounter) {
  // Symptoms
  await prisma.symptom.createMany({
    data: [
      {
        encounterId: encounter.id,
        symptomCode: 'R05',
        symptomDescription: 'Productive cough with yellow sputum',
        onsetDate: dt('2024-01-31'),
        severity: 'MODERATE',
        durationDays: 5,
        progression: 'Gradually worsening',
      },
      {
        encounterId: encounter.id,
        symptomCode: 'R06.0',
        symptomDescription: 'Dyspnoea on exertion',
        severity: 'MILD',
        durationDays: 3,
      },
    ],
  });

  // Vital signs
  await prisma.vitalSigns.create({
    data: {
      encounterId: encounter.id,
      recordedAt: encounter.encounterDateTime,
      temperatureCelsius: 37.9,
      pulseRateBpm: 92,
      respiratoryRate: 20,
      bpSystolic: 138,
      bpDiastolic: 88,
      oxygenSaturationPercent: 96.5,
      bloodGlucoseMgDl: 142,
      weightKg: 68.5,
      heightCm: 163.0,
      bmi: 25.8,
      painScore: 4,
    },
  });

  // Diagnoses
  const primaryDiagnosis = await prisma.diagnosis.create({
    data: {
      encounterId: encounter.id,
      diagnosisCode: 'J18.9',
      diagnosisName: 'Community-acquired pneumonia, unspecified',
      diagnosisType: 'PRIMARY',
      certainty: 'CONFIRMED',
      diagnosedAt: encounter.encounterDateTime,
    },
  });

  await prisma.diagnosis.create({
    data: {
      encounterId: encounter.id,
      diagnosisCode: 'E11.9',
      diagnosisName: 'Type 2 Diabetes Mellitus without complications',
      diagnosisType: 'SECONDARY',
      certainty: 'CONFIRMED',
      diagnosedAt: encounter.encounterDateTime,
    },
  });

  // Clinical note
  await prisma.clinicalNote.create({
    data: {
      encounterId: encounter.id,
      noteType: 'SOAP',
      noteText: [
        'S: Patient complains of productive cough x5 days, low-grade fever, and mild breathlessness.',
        'O: Temp 37.9°C, PR 92 bpm, RR 20/min, SpO2 96%, BP 138/88 mmHg. Crackles in right lower zone.',
        'A: Community-acquired pneumonia. Background T2DM and hypertension.',
        'P: Amoxicillin-clavulanate 625 mg BD x7 days. Paracetamol 1 g TDS PRN. Increase fluid intake. Review in 1 week.',
      ].join('\n'),
    },
  });

  // Medications
  await prisma.medication.createMany({
    data: [
      {
        encounterId: encounter.id,
        drugCode: 'J01CR02',
        drugName: 'Amoxicillin-Clavulanate',
        dosage: '625 mg',
        route: 'ORAL',
        frequency: 'Twice daily',
        duration: '7 days',
        indication: 'Community-acquired pneumonia',
        startDate: dt('2024-02-05'),
        endDate: dt('2024-02-12'),
      },
      {
        encounterId: encounter.id,
        drugCode: 'N02BE01',
        drugName: 'Paracetamol',
        dosage: '1 g',
        route: 'ORAL',
        frequency: 'Three times daily PRN',
        duration: '5 days',
        indication: 'Fever and pain relief',
        startDate: dt('2024-02-05'),
      },
    ],
  });

  // Lab order + result
  const labOrder = await prisma.labOrder.create({
    data: {
      encounterId: encounter.id,
      testCode: 'FBC',
      testName: 'Full Blood Count',
      specimenType: 'Venous blood',
      priority: 'URGENT',
      orderedAt: encounter.encounterDateTime,
    },
  });

  await prisma.labResult.createMany({
    data: [
      {
        labOrderId: labOrder.id,
        analyteCode: 'WBC',
        analyteName: 'White Blood Cell Count',
        resultValue: '14.2',
        unit: '×10⁹/L',
        referenceRange: '4.0–11.0',
        abnormalFlag: true,
        resultStatus: 'COMPLETED',
        resultedAt: new Date(encounter.encounterDateTime.getTime() + 2 * 60 * 60 * 1000),
      },
      {
        labOrderId: labOrder.id,
        analyteCode: 'HGB',
        analyteName: 'Haemoglobin',
        resultValue: '11.8',
        unit: 'g/dL',
        referenceRange: '12.0–16.0',
        abnormalFlag: true,
        resultStatus: 'COMPLETED',
        resultedAt: new Date(encounter.encounterDateTime.getTime() + 2 * 60 * 60 * 1000),
      },
    ],
  });

  // Imaging order + report
  const imagingOrder = await prisma.imagingOrder.create({
    data: {
      encounterId: encounter.id,
      modality: 'XRAY',
      bodySite: 'Chest (PA)',
      clinicalIndication: 'Suspected pneumonia',
      orderedAt: encounter.encounterDateTime,
    },
  });

  await prisma.imagingReport.create({
    data: {
      imagingOrderId: imagingOrder.id,
      findings:
        'Increased opacity in the right lower lobe consistent with consolidation. No pleural effusion. Heart size normal.',
      impression: 'Right lower lobe pneumonia.',
      reportedAt: new Date(encounter.encounterDateTime.getTime() + 3 * 60 * 60 * 1000),
    },
  });

  // Procedure
  await prisma.procedure.create({
    data: {
      encounterId: encounter.id,
      procedureCode: '94760',
      procedureName: 'Pulse Oximetry',
      indication: 'Monitoring oxygen saturation in respiratory illness',
      findings: 'SpO2 96% on room air',
      outcome: 'Stable; no supplemental oxygen required',
      performedAt: encounter.encounterDateTime,
    },
  });

  // Clinical outcome
  await prisma.clinicalOutcome.create({
    data: {
      encounterId: encounter.id,
      outcomeType: 'Discharge',
      outcomeStatus: 'IMPROVED',
      recoveryStatus: 'Partial — follow-up scheduled',
      complicationFlag: false,
      mortalityFlag: false,
      recordedAt: new Date(encounter.encounterDateTime.getTime() + 4 * 60 * 60 * 1000),
    },
  });

  // Encounter-level observation
  await prisma.observation.create({
    data: {
      patientId: patient.id,
      encounterId: encounter.id,
      observationType: 'SpO2 trend',
      value: '96',
      unit: '%',
      interpretation: 'Borderline — monitor closely',
      observedAt: encounter.encounterDateTime,
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding EHR data...\n');

  for (const patientData of PATIENTS) {
    await seedPatient(patientData);
  }

  console.log('\nSeed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
