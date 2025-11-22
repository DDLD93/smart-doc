-- SQL Schema for MIMIC-III CSV Data Files

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE patients (
    subject_id INTEGER PRIMARY KEY,
    gender VARCHAR(1) NOT NULL,
    anchor_age INTEGER NOT NULL,
    anchor_year INTEGER NOT NULL,
    anchor_year_group VARCHAR(50),
    dod DATE NULL
);

-- ============================================
-- ADMISSIONS TABLE
-- ============================================
CREATE TABLE admissions (
    subject_id INTEGER NOT NULL,
    hadm_id INTEGER PRIMARY KEY,
    admittime TIMESTAMP NOT NULL,
    dischtime TIMESTAMP NOT NULL,
    deathtime TIMESTAMP NULL,
    admission_type VARCHAR(50) NOT NULL,
    admit_provider_id VARCHAR(50) NOT NULL,
    admission_location VARCHAR(100),
    discharge_location VARCHAR(100),
    insurance VARCHAR(50),
    language VARCHAR(50),
    marital_status VARCHAR(50),
    race VARCHAR(100),
    edregtime TIMESTAMP NULL,
    edouttime TIMESTAMP NULL,
    hospital_expire_flag INTEGER,
    FOREIGN KEY (subject_id) REFERENCES patients(subject_id)
);

-- ============================================
-- EMAR (Electronic Medication Administration Record) TABLE
-- ============================================
CREATE TABLE emar (
    subject_id INTEGER NOT NULL,
    hadm_id INTEGER NOT NULL,
    emar_id VARCHAR(50) NOT NULL,
    emar_seq INTEGER NOT NULL,
    poe_id VARCHAR(50),
    pharmacy_id VARCHAR(50),
    enter_provider_id VARCHAR(50),
    charttime TIMESTAMP,
    medication VARCHAR(200),
    event_txt TEXT,
    scheduletime TIMESTAMP,
    storetime TIMESTAMP,
    PRIMARY KEY (emar_id, emar_seq),
    FOREIGN KEY (subject_id) REFERENCES patients(subject_id),
    FOREIGN KEY (hadm_id) REFERENCES admissions(hadm_id)
);

-- ============================================
-- D_ICD_DIAGNOSES TABLE (ICD Diagnosis Codes)
-- ============================================
CREATE TABLE d_icd_diagnoses (
    icd_code VARCHAR(10) PRIMARY KEY,
    icd_version INTEGER NOT NULL,
    long_title TEXT NOT NULL
);

-- ============================================
-- D_HCPCS TABLE (Healthcare Common Procedure Coding System)
-- ============================================
CREATE TABLE d_hcpcs (
    code VARCHAR(20) PRIMARY KEY,
    category VARCHAR(50),
    long_description TEXT,
    short_description VARCHAR(200)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Indexes on patients table
CREATE INDEX idx_patients_subject_id ON patients(subject_id);

-- Indexes on admissions table
CREATE INDEX idx_admissions_subject_id ON admissions(subject_id);
CREATE INDEX idx_admissions_hadm_id ON admissions(hadm_id);
CREATE INDEX idx_admissions_admittime ON admissions(admittime);
CREATE INDEX idx_admissions_dischtime ON admissions(dischtime);
CREATE INDEX idx_admissions_admission_type ON admissions(admission_type);

-- Indexes on emar table
CREATE INDEX idx_emar_subject_id ON emar(subject_id);
CREATE INDEX idx_emar_hadm_id ON emar(hadm_id);
CREATE INDEX idx_emar_charttime ON emar(charttime);
CREATE INDEX idx_emar_medication ON emar(medication);

-- Indexes on d_icd_diagnoses table
CREATE INDEX idx_icd_version ON d_icd_diagnoses(icd_version);

-- Indexes on d_hcpcs table
CREATE INDEX idx_hcpcs_category ON d_hcpcs(category);

-- ============================================
-- COMMENTS ON TABLES AND COLUMNS
-- ============================================
COMMENT ON TABLE patients IS 'Patient demographic and anchor information';
COMMENT ON TABLE admissions IS 'Hospital admission records';
COMMENT ON TABLE emar IS 'Electronic Medication Administration Records';
COMMENT ON TABLE d_icd_diagnoses IS 'ICD diagnosis code dictionary';
COMMENT ON TABLE d_hcpcs IS 'HCPCS procedure code dictionary';

COMMENT ON COLUMN patients.subject_id IS 'Unique patient identifier';
COMMENT ON COLUMN patients.dod IS 'Date of death';
COMMENT ON COLUMN admissions.hadm_id IS 'Unique hospital admission identifier';
COMMENT ON COLUMN admissions.hospital_expire_flag IS 'Binary flag indicating whether patient died in hospital';
COMMENT ON COLUMN emar.emar_id IS 'Unique EMAR record identifier';
COMMENT ON COLUMN emar.charttime IS 'Time when medication was charted';
COMMENT ON COLUMN emar.scheduletime IS 'Scheduled time for medication administration';
COMMENT ON COLUMN emar.storetime IS 'Time when medication was stored in system';

