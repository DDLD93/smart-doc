-- CreateTable
CREATE TABLE "patients" (
    "subject_id" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "anchor_age" INTEGER NOT NULL,
    "anchor_year" INTEGER NOT NULL,
    "anchor_year_group" TEXT,
    "dod" TIMESTAMP(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("subject_id")
);

-- CreateTable
CREATE TABLE "admissions" (
    "subject_id" INTEGER NOT NULL,
    "hadm_id" TEXT NOT NULL,
    "admittime" TIMESTAMP(3) NOT NULL,
    "dischtime" TIMESTAMP(3) NOT NULL,
    "deathtime" TIMESTAMP(3),
    "admission_type" TEXT NOT NULL,
    "admit_provider_id" TEXT NOT NULL,
    "admission_location" TEXT,
    "discharge_location" TEXT,
    "insurance" TEXT,
    "language" TEXT,
    "marital_status" TEXT,
    "race" TEXT,
    "edregtime" TIMESTAMP(3),
    "edouttime" TIMESTAMP(3),
    "hospital_expire_flag" INTEGER,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("hadm_id")
);

-- CreateTable
CREATE TABLE "emar" (
    "id" SERIAL NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "hadm_id" TEXT NOT NULL,
    "emar_id" TEXT NOT NULL,
    "emar_seq" INTEGER NOT NULL,
    "poe_id" TEXT,
    "pharmacy_id" TEXT,
    "enter_provider_id" TEXT,
    "charttime" TIMESTAMP(3),
    "medication" TEXT,
    "event_txt" TEXT,
    "scheduletime" TIMESTAMP(3),
    "storetime" TIMESTAMP(3),

    CONSTRAINT "emar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "d_icd_diagnoses" (
    "icd_code" TEXT NOT NULL,
    "icd_version" INTEGER NOT NULL,
    "long_title" TEXT NOT NULL,

    CONSTRAINT "d_icd_diagnoses_pkey" PRIMARY KEY ("icd_code")
);

-- CreateTable
CREATE TABLE "d_hcpcs" (
    "code" TEXT NOT NULL,
    "category" TEXT,
    "long_description" TEXT,
    "short_description" TEXT,

    CONSTRAINT "d_hcpcs_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "emar_hadm_id_idx" ON "emar"("hadm_id");

-- CreateIndex
CREATE INDEX "emar_subject_id_idx" ON "emar"("subject_id");

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "patients"("subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emar" ADD CONSTRAINT "emar_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "patients"("subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emar" ADD CONSTRAINT "emar_hadm_id_fkey" FOREIGN KEY ("hadm_id") REFERENCES "admissions"("hadm_id") ON DELETE RESTRICT ON UPDATE CASCADE;
