/* =========================================================
   CORE MEDICAL EHR / EMR TYPES
   Strictly clinical domain only
========================================================= */

/* =========================================================
   COMMON TYPES
========================================================= */

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type Sex =
  | "male"
  | "female"
  | "intersex"
  | "unknown";

export type BloodGroup =
  | "A+"
  | "A-"
  | "B+"
  | "B-"
  | "AB+"
  | "AB-"
  | "O+"
  | "O-"
  | "unknown";

export type Genotype =
  | "AA"
  | "AS"
  | "SS"
  | "AC"
  | "SC"
  | "unknown";

export interface AuditMetadata {
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
  deletedAt?: ISODateTime | null;
}

/* =========================================================
   PATIENTS
========================================================= */

export interface Patient extends AuditMetadata {
  id: UUID;

  medicalRecordNumber: string;

  firstName: string;
  middleName?: string;
  lastName: string;

  dateOfBirth: ISODate;

  sex: Sex;

  bloodGroup?: BloodGroup;
  genotype?: Genotype;

  baselineHeightCm?: number;
  baselineWeightKg?: number;

  deceased: boolean;
  deceasedDate?: ISODate;

  organDonor?: boolean;
}

/* =========================================================
   ENCOUNTERS
========================================================= */

export type EncounterType =
  | "outpatient"
  | "inpatient"
  | "emergency"
  | "telemedicine";

export type EncounterDisposition =
  | "discharged"
  | "admitted"
  | "referred"
  | "transferred"
  | "deceased"
  | "ongoing";

export interface Encounter extends AuditMetadata {
  id: UUID;

  patientId: UUID;

  encounterType: EncounterType;

  encounterDateTime: ISODateTime;

  chiefComplaint: string;

  clinicalSummary?: string;

  attendingClinicianId?: UUID;

  disposition: EncounterDisposition;
}

/* =========================================================
   SYMPTOMS
========================================================= */

export type SymptomSeverity =
  | "mild"
  | "moderate"
  | "severe"
  | "critical";

export interface Symptom extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  symptomCode?: string;

  symptomDescription: string;

  onsetDate?: ISODate;

  severity?: SymptomSeverity;

  durationDays?: number;

  progression?: string;
}

/* =========================================================
   VITAL SIGNS
========================================================= */

export interface BloodPressure {
  systolic: number;
  diastolic: number;
}

export interface VitalSigns extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  recordedAt: ISODateTime;

  temperatureCelsius?: number;

  pulseRateBpm?: number;

  respiratoryRate?: number;

  bloodPressure?: BloodPressure;

  oxygenSaturationPercent?: number;

  bloodGlucoseMgDl?: number;

  weightKg?: number;

  heightCm?: number;

  bmi?: number;

  painScore?: number;
}

/* =========================================================
   ALLERGIES
========================================================= */

export type AllergySeverity =
  | "low"
  | "moderate"
  | "high"
  | "life_threatening";

export type AllergyStatus =
  | "active"
  | "resolved";

export interface Allergy extends AuditMetadata {
  id: UUID;

  patientId: UUID;

  allergen: string;

  reaction: string;

  severity: AllergySeverity;

  onsetDate?: ISODate;

  status: AllergyStatus;
}

/* =========================================================
   MEDICAL HISTORY
========================================================= */

export type Chronicity =
  | "acute"
  | "chronic"
  | "recurrent"
  | "resolved";

export interface MedicalHistory extends AuditMetadata {
  id: UUID;

  patientId: UUID;

  conditionCode?: string;

  conditionName: string;

  diagnosisDate?: ISODate;

  resolutionDate?: ISODate;

  chronicity?: Chronicity;

  familyHistory: boolean;
}

/* =========================================================
   DIAGNOSES
========================================================= */

export type DiagnosisType =
  | "primary"
  | "secondary"
  | "differential";

export type DiagnosisCertainty =
  | "suspected"
  | "confirmed"
  | "ruled_out";

export interface Diagnosis extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  diagnosisCode?: string;

  diagnosisName: string;

  diagnosisType: DiagnosisType;

  certainty: DiagnosisCertainty;

  diagnosedAt: ISODateTime;
}

/* =========================================================
   CLINICAL NOTES
========================================================= */

export type ClinicalNoteType =
  | "soap"
  | "progress"
  | "operative"
  | "discharge"
  | "consultation"
  | "nursing";

export interface ClinicalNote extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  noteType: ClinicalNoteType;

  noteText: string;

  authorClinicianId?: UUID;

  createdAt: ISODateTime;
}

/* =========================================================
   MEDICATIONS
========================================================= */

export type MedicationRoute =
  | "oral"
  | "intravenous"
  | "intramuscular"
  | "subcutaneous"
  | "topical"
  | "inhalation"
  | "rectal"
  | "ophthalmic"
  | "otic"
  | "nasal"
  | "other";

export interface Medication extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  drugCode?: string;

  drugName: string;

  dosage: string;

  route: MedicationRoute;

  frequency: string;

  duration?: string;

  indication?: string;

  startDate?: ISODate;

  endDate?: ISODate;
}

/* =========================================================
   LAB ORDERS
========================================================= */

export type LabPriority =
  | "routine"
  | "urgent"
  | "stat";

export interface LabOrder extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  testCode?: string;

  testName: string;

  specimenType?: string;

  priority: LabPriority;

  orderedAt: ISODateTime;
}

/* =========================================================
   LAB RESULTS
========================================================= */

export type LabResultStatus =
  | "pending"
  | "completed"
  | "corrected"
  | "cancelled";

export interface LabResult extends AuditMetadata {
  id: UUID;

  labOrderId: UUID;

  analyteCode?: string;

  analyteName: string;

  resultValue: string | number;

  unit?: string;

  referenceRange?: string;

  abnormalFlag?: boolean;

  resultStatus: LabResultStatus;

  resultedAt: ISODateTime;
}

/* =========================================================
   IMAGING ORDERS
========================================================= */

export type ImagingModality =
  | "xray"
  | "ct"
  | "mri"
  | "ultrasound"
  | "pet"
  | "mammography"
  | "fluoroscopy"
  | "ecg"
  | "echo";

export interface ImagingOrder extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  modality: ImagingModality;

  bodySite?: string;

  clinicalIndication?: string;

  orderedAt: ISODateTime;
}

/* =========================================================
   IMAGING REPORTS
========================================================= */

export interface ImagingReport extends AuditMetadata {
  id: UUID;

  imagingOrderId: UUID;

  findings: string;

  impression?: string;

  radiologistId?: UUID;

  reportedAt: ISODateTime;
}

/* =========================================================
   PROCEDURES
========================================================= */

export interface Procedure extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  procedureCode?: string;

  procedureName: string;

  indication?: string;

  findings?: string;

  complications?: string;

  outcome?: string;

  performedAt: ISODateTime;
}

/* =========================================================
   CARE PLANS
========================================================= */

export type CarePlanStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "on_hold";

export interface CarePlan extends AuditMetadata {
  id: UUID;

  patientId: UUID;

  diagnosisId?: UUID;

  goals: string[];

  interventions: string[];

  monitoringPlan?: string;

  reviewDate?: ISODate;

  status: CarePlanStatus;
}

/* =========================================================
   IMMUNIZATIONS
========================================================= */

export interface Immunization extends AuditMetadata {
  id: UUID;

  patientId: UUID;

  vaccineCode?: string;

  vaccineName: string;

  doseNumber?: number;

  administrationDate: ISODate;

  adverseReaction?: string;
}

/* =========================================================
   CLINICAL OUTCOMES
========================================================= */

export type OutcomeStatus =
  | "improved"
  | "stable"
  | "deteriorated"
  | "recovered"
  | "deceased";

export interface ClinicalOutcome extends AuditMetadata {
  id: UUID;

  encounterId: UUID;

  outcomeType?: string;

  outcomeStatus: OutcomeStatus;

  recoveryStatus?: string;

  complicationFlag?: boolean;

  mortalityFlag?: boolean;

  recordedAt: ISODateTime;
}

/* =========================================================
   OBSERVATIONS
========================================================= */

export interface Observation extends AuditMetadata {
  id: UUID;

  patientId: UUID;

  encounterId?: UUID;

  observationType: string;

  observationCode?: string;

  value: string | number | boolean;

  unit?: string;

  interpretation?: string;

  observedAt: ISODateTime;
}

/* =========================================================
   CLINICAL SUMMARY AGGREGATE
========================================================= */

export interface PatientClinicalRecord {
  patient: Patient;

  encounters: Encounter[];

  symptoms: Symptom[];

  vitals: VitalSigns[];

  allergies: Allergy[];

  medicalHistory: MedicalHistory[];

  diagnoses: Diagnosis[];

  clinicalNotes: ClinicalNote[];

  medications: Medication[];

  labOrders: LabOrder[];

  labResults: LabResult[];

  imagingOrders: ImagingOrder[];

  imagingReports: ImagingReport[];

  procedures: Procedure[];

  carePlans: CarePlan[];

  immunizations: Immunization[];

  outcomes: ClinicalOutcome[];

  observations: Observation[];
}