const { PrismaClient } = require('@prisma/client');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const CSV_DIR = path.join(__dirname, '../csv');
const BATCH_SIZE = 1000;

// Helper function to parse date
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '' || dateStr === 'NULL') return null;
  return new Date(dateStr);
}

// Helper function to parse integer
function parseInt(str) {
  if (!str || str.trim() === '' || str === 'NULL') return null;
  const parsed = Number(str);
  return isNaN(parsed) ? null : parsed;
}

// Helper function to parse string
function parseString(str) {
  if (!str || str.trim() === '' || str === 'NULL') return null;
  return str.trim();
}

// Process CSV file in batches
async function processCSV(filePath, transformFn, batchFn) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let count = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', async (row) => {
        try {
          const transformed = transformFn(row);
          if (transformed) {
            rows.push(transformed);
            count++;
            
            if (rows.length >= BATCH_SIZE) {
              await batchFn(rows);
              rows.length = 0; // Clear array
              console.log(`  Processed ${count} rows...`);
            }
          }
        } catch (error) {
          console.error(`Error processing row:`, error);
        }
      })
      .on('end', async () => {
        // Process remaining rows
        if (rows.length > 0) {
          await batchFn(rows);
        }
        console.log(`  Total: ${count} rows processed`);
        resolve(count);
      })
      .on('error', reject);
  });
}

async function importPatients() {
  console.log('\n📊 Importing patients.csv...');
  return processCSV(
    path.join(CSV_DIR, 'patients.csv'),
    (row) => ({
      subjectId: parseInt(row.subject_id),
      gender: parseString(row.gender),
      anchorAge: parseInt(row.anchor_age),
      anchorYear: parseInt(row.anchor_year),
      anchorYearGroup: parseString(row.anchor_year_group),
      dod: parseDate(row.dod),
    }),
    async (batch) => {
      await prisma.patient.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
  );
}

async function importAdmissions() {
  console.log('\n📊 Importing admissions.csv...');
  return processCSV(
    path.join(CSV_DIR, 'admissions.csv'),
    (row) => ({
      subjectId: parseInt(row.subject_id),
      hadmId: parseString(row.hadm_id),
      admittime: parseDate(row.admittime),
      dischtime: parseDate(row.dischtime),
      deathtime: parseDate(row.deathtime),
      admissionType: parseString(row.admission_type),
      admitProviderId: parseString(row.admit_provider_id),
      admissionLocation: parseString(row.admission_location),
      dischargeLocation: parseString(row.discharge_location),
      insurance: parseString(row.insurance),
      language: parseString(row.language),
      maritalStatus: parseString(row.marital_status),
      race: parseString(row.race),
      edregtime: parseDate(row.edregtime),
      edouttime: parseDate(row.edouttime),
      hospitalExpireFlag: parseInt(row.hospital_expire_flag),
    }),
    async (batch) => {
      // Filter out null entries
      const validBatch = batch.filter(item => item.subjectId && item.hadmId);
      if (validBatch.length > 0) {
        await prisma.admission.createMany({
          data: validBatch,
          skipDuplicates: true,
        });
      }
    }
  );
}

async function importEmar() {
  console.log('\n📊 Importing emar.csv...');
  return processCSV(
    path.join(CSV_DIR, 'emar.csv'),
    (row) => ({
      subjectId: parseInt(row.subject_id),
      hadmId: parseString(row.hadm_id),
      emarId: parseString(row.emar_id),
      emarSeq: parseInt(row.emar_seq),
      poeId: parseString(row.poe_id),
      pharmacyId: parseString(row.pharmacy_id),
      enterProviderId: parseString(row.enter_provider_id),
      charttime: parseDate(row.charttime),
      medication: parseString(row.medication),
      eventTxt: parseString(row.event_txt),
      scheduletime: parseDate(row.scheduletime),
      storetime: parseDate(row.storetime),
    }),
    async (batch) => {
      // Filter out invalid entries
      const validBatch = batch.filter(item => 
        item.subjectId && item.hadmId && item.emarId
      );
      
      if (validBatch.length > 0) {
        // Create records without foreign key constraints temporarily
        await prisma.emar.createMany({
          data: validBatch,
          skipDuplicates: true,
        });
      }
    }
  );
}

async function importIcdDiagnoses() {
  console.log('\n📊 Importing d_icd_diagnoses.csv...');
  return processCSV(
    path.join(CSV_DIR, 'd_icd_diagnoses.csv'),
    (row) => ({
      icdCode: parseString(row.icd_code),
      icdVersion: parseInt(row.icd_version),
      longTitle: parseString(row.long_title),
    }),
    async (batch) => {
      // Filter out entries without icdCode
      const validBatch = batch.filter(item => item.icdCode);
      if (validBatch.length > 0) {
        await prisma.icdDiagnosis.createMany({
          data: validBatch,
          skipDuplicates: true,
        });
      }
    }
  );
}

async function importHcpcs() {
  console.log('\n📊 Importing d_hcpcs.csv...');
  return processCSV(
    path.join(CSV_DIR, 'd_hcpcs.csv'),
    (row) => ({
      code: parseString(row.code),
      category: parseString(row.category),
      longDescription: parseString(row.long_description),
      shortDescription: parseString(row.short_description),
    }),
    async (batch) => {
      // Filter out entries without code
      const validBatch = batch.filter(item => item.code);
      if (validBatch.length > 0) {
        await prisma.hcpcs.createMany({
          data: validBatch,
          skipDuplicates: true,
        });
      }
    }
  );
}

async function main() {
  try {
    console.log('🚀 Starting CSV import process...\n');
    
    const startTime = Date.now();
    
    // Import in order: patients → admissions → emar → dictionaries
    await importPatients();
    await importAdmissions();
    await importEmar();
    await importIcdDiagnoses();
    await importHcpcs();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ Import completed successfully!');
    console.log(`⏱️  Total time: ${duration} seconds`);
    
  } catch (error) {
    console.error('❌ Error during import:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });

