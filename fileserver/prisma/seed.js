'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany(arr, min, max) {
  const n = randInt(min, max);
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, dp = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp));
}

function randDate(from, to) {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

const MALE_FIRST = [
  'Emeka','Chukwuemeka','Obinna','Ikenna','Chidi','Uche','Kelechi','Tochukwu',
  'Adebayo','Adewale','Adesola','Adeyemi','Oluwaseun','Oluwafemi','Babatunde',
  'Yusuf','Musa','Ibrahim','Abdullahi','Suleiman','Muhammed','Ahmad','Abubakar',
  'Taiwo','Kehinde','Rotimi','Gbenga','Lanre','Femi','Segun',
  'Chukwuma','Nnamdi','Chigozie','Onyeka','Uzoma','Ebuka','Tunde','Kunle',
  'Bola','Dele','Niyi','Tobi','Wale','Dayo','Lekan','Biodun',
  'Bello','Garba','Lawal','Umar','Hassan','Aliyu','Nasir','Sadiq',
  'James','Peter','John','Samuel','Emmanuel','David','Daniel','Michael',
  'Augustine','Benedict','Clement','Dominic','Francis','Gregory',
  'Eze','Amadi','Okonkwo','Ugwu','Agu','Obi','Odo','Okafor',
];

const FEMALE_FIRST = [
  'Amara','Chisom','Adaeze','Ngozi','Chinwe','Ifeoma','Chinyere','Obiageli',
  'Folake','Funmilayo','Titilayo','Adunola','Omolara','Sola','Toyin','Bisi',
  'Fatima','Zainab','Hauwa','Maryam','Aisha','Khadijah','Bilkisu','Ramatu',
  'Blessing','Grace','Mercy','Joy','Patience','Peace','Faith','Hope',
  'Uchenna','Adanna','Ebele','Ogechukwu','Amarachi','Chukwuamaka',
  'Yetunde','Morenike','Abimbola','Adeola','Bukola','Ronke','Shade',
  'Zara','Laila','Nadia','Sara','Muna','Hana','Rabi','Safiya',
  'Stella','Veronica','Beatrice','Cecilia','Agnes','Monica','Felicia',
  'Adaora','Ogechi','Uloma','Obioma','Chidinma','Ujunwa','Nneka',
];

const LAST_NAMES = [
  'Okafor','Nwachukwu','Okonkwo','Eze','Amadi','Ugwu','Obi','Nwosu',
  'Adeyemi','Adebayo','Adesola','Ogundimu','Olawale','Balogun','Afolabi',
  'Bello','Musa','Garba','Lawal','Ibrahim','Suleiman','Aliyu','Umar',
  'Nwokocha','Onyekachi','Chukwu','Obiora','Nzeka','Ike','Nweke',
  'Fadahunsi','Fashola','Tinubu','Ambode','Osoba','Awolowo',
  'Mohammed','Abdullahi','Yusuf','Hassan','Nasir','Sadiq',
  'Oduya','Osunde','Ekhator','Osagie','Omoruyi','Izevbigie',
  'Abubakar','Buhari','Ribadu','Shehu','Dikko','Kwankwaso',
  'James','Peter','Thomas','Williams','Johnson','Brown','Davis',
  'Ogundele','Ogunbiyi','Ogunleye','Ogunyemi','Oguns',
  'Nwachukwu','Nwankwo','Nwoke','Nwobi','Nwagwu',
];

const MIDDLE_NAMES = [
  'Chisom','Tobechukwu','Emeka','Uchenna','Adaeze','Oluwaseun','Babatunde',
  'Fatima','Zainab','Blessing','Grace','Mercy','Joy','Patience',
  'Chukwuemeka','Obinna','Ikenna','Chidi','Uche','Kelechi',
  'Yusuf','Musa','Ibrahim','Hassan','Aliyu',
  null, null, null,
];

// ---------------------------------------------------------------------------
// Demographic pools
// ---------------------------------------------------------------------------

const BLOOD_GROUPS = ['A_POS','A_NEG','B_POS','B_NEG','AB_POS','AB_NEG','O_POS','O_NEG'];
const GENOTYPES    = ['AA','AA','AA','AS','AS','SS','AC','SC'];
const SEX_POOL     = ['MALE','MALE','FEMALE','FEMALE','FEMALE'];

// ---------------------------------------------------------------------------
// Clinical data pools
// ---------------------------------------------------------------------------

const ALLERGENS = [
  { allergen:'Penicillin',          reaction:'Urticaria and angioedema',           severity:'HIGH',             status:'ACTIVE' },
  { allergen:'Sulfonamides',        reaction:'Maculopapular rash',                  severity:'MODERATE',         status:'RESOLVED' },
  { allergen:'Aspirin',             reaction:'Bronchospasm and urticaria',           severity:'HIGH',             status:'ACTIVE' },
  { allergen:'Ibuprofen',           reaction:'Gastric irritation and rash',          severity:'MODERATE',         status:'ACTIVE' },
  { allergen:'Codeine',             reaction:'Nausea and respiratory depression',    severity:'HIGH',             status:'ACTIVE' },
  { allergen:'Latex',               reaction:'Contact dermatitis',                   severity:'MODERATE',         status:'ACTIVE' },
  { allergen:'Peanuts',             reaction:'Anaphylaxis',                          severity:'LIFE_THREATENING', status:'ACTIVE' },
  { allergen:'Shellfish',           reaction:'Urticaria and angioedema',             severity:'HIGH',             status:'ACTIVE' },
  { allergen:'Eggs',                reaction:'Urticaria',                            severity:'MODERATE',         status:'ACTIVE' },
  { allergen:'Milk',                reaction:'GI upset and rash',                    severity:'LOW',              status:'RESOLVED' },
  { allergen:'Tetracycline',        reaction:'Photosensitivity rash',                severity:'MODERATE',         status:'RESOLVED' },
  { allergen:'Metronidazole',       reaction:'Nausea and dizziness',                 severity:'LOW',              status:'RESOLVED' },
  { allergen:'Chloroquine',         reaction:'Pruritus',                             severity:'LOW',              status:'ACTIVE' },
  { allergen:'Quinine',             reaction:'Cinchonism (tinnitus, headache)',       severity:'MODERATE',         status:'ACTIVE' },
  { allergen:'Tramadol',            reaction:'Seizures and dizziness',               severity:'HIGH',             status:'ACTIVE' },
  { allergen:'Ceftriaxone',         reaction:'Rash and fever',                       severity:'MODERATE',         status:'ACTIVE' },
  { allergen:'Erythromycin',        reaction:'GI upset',                             severity:'LOW',              status:'RESOLVED' },
  { allergen:'Dust mites',          reaction:'Rhinitis and asthma',                  severity:'MODERATE',         status:'ACTIVE' },
  { allergen:'Bee venom',           reaction:'Anaphylaxis',                          severity:'LIFE_THREATENING', status:'ACTIVE' },
  { allergen:'Contrast dye',        reaction:'Urticaria and flushing',               severity:'HIGH',             status:'ACTIVE' },
];

const CONDITIONS = [
  { code:'E11',   name:'Type 2 Diabetes Mellitus',              chronicity:'CHRONIC',    family:true  },
  { code:'I10',   name:'Essential Hypertension',                 chronicity:'CHRONIC',    family:true  },
  { code:'J45',   name:'Bronchial Asthma',                       chronicity:'CHRONIC',    family:false },
  { code:'D57',   name:'Sickle Cell Disease',                    chronicity:'CHRONIC',    family:true  },
  { code:'B50',   name:'Plasmodium falciparum malaria',          chronicity:'ACUTE',      family:false },
  { code:'A01.0', name:'Typhoid Fever',                          chronicity:'ACUTE',      family:false },
  { code:'J18.9', name:'Community-acquired Pneumonia',           chronicity:'ACUTE',      family:false },
  { code:'A15',   name:'Pulmonary Tuberculosis',                 chronicity:'CHRONIC',    family:false },
  { code:'I25',   name:'Ischaemic Heart Disease',                chronicity:'CHRONIC',    family:true  },
  { code:'N18',   name:'Chronic Kidney Disease',                 chronicity:'CHRONIC',    family:true  },
  { code:'K29',   name:'Gastritis',                              chronicity:'RECURRENT',  family:false },
  { code:'M54.5', name:'Low Back Pain',                          chronicity:'RECURRENT',  family:false },
  { code:'E03',   name:'Hypothyroidism',                         chronicity:'CHRONIC',    family:true  },
  { code:'K80',   name:'Cholelithiasis (Gallstones)',            chronicity:'CHRONIC',    family:false },
  { code:'J06.9', name:'Acute Upper Respiratory Tract Infection',chronicity:'ACUTE',      family:false },
  { code:'B17',   name:'Hepatitis B Infection',                  chronicity:'CHRONIC',    family:false },
  { code:'E78',   name:'Hyperlipidaemia',                        chronicity:'CHRONIC',    family:true  },
  { code:'G40',   name:'Epilepsy',                               chronicity:'CHRONIC',    family:true  },
  { code:'F32',   name:'Depressive Disorder',                    chronicity:'RECURRENT',  family:false },
  { code:'I50',   name:'Heart Failure',                          chronicity:'CHRONIC',    family:true  },
  { code:'M05',   name:'Rheumatoid Arthritis',                   chronicity:'CHRONIC',    family:false },
  { code:'L20',   name:'Atopic Dermatitis (Eczema)',             chronicity:'CHRONIC',    family:true  },
  { code:'A09',   name:'Acute Gastroenteritis',                  chronicity:'ACUTE',      family:false },
  { code:'N39',   name:'Urinary Tract Infection',                chronicity:'RECURRENT',  family:false },
  { code:'E11.2', name:'Type 2 Diabetes with Renal Complications',chronicity:'CHRONIC',   family:true  },
];

const VACCINES = [
  { code:'COVID19',  name:'COVID-19 mRNA Vaccine (Moderna)',     minDose:1, maxDose:3 },
  { code:'YF',       name:'Yellow Fever Vaccine',                minDose:1, maxDose:1 },
  { code:'OPV',      name:'Oral Polio Vaccine',                  minDose:1, maxDose:4 },
  { code:'BCG',      name:'BCG (Tuberculosis) Vaccine',          minDose:1, maxDose:1 },
  { code:'HBV',      name:'Hepatitis B Vaccine',                 minDose:1, maxDose:3 },
  { code:'MMR',      name:'Measles-Mumps-Rubella Vaccine',       minDose:1, maxDose:2 },
  { code:'TET',      name:'Tetanus Toxoid Vaccine',              minDose:1, maxDose:3 },
  { code:'MEN',      name:'Meningococcal Vaccine',               minDose:1, maxDose:2 },
  { code:'TYP',      name:'Typhoid Conjugate Vaccine',           minDose:1, maxDose:1 },
  { code:'HPV',      name:'Human Papillomavirus (HPV) Vaccine',  minDose:1, maxDose:3 },
  { code:'INF',      name:'Influenza Vaccine (Seasonal)',        minDose:1, maxDose:1 },
  { code:'PCV',      name:'Pneumococcal Conjugate Vaccine',      minDose:1, maxDose:3 },
  { code:'ROTA',     name:'Rotavirus Vaccine',                   minDose:1, maxDose:3 },
  { code:'DPT',      name:'Diphtheria-Pertussis-Tetanus Vaccine',minDose:1, maxDose:5 },
];

const SYMPTOMS = [
  { code:'R05',    desc:'Productive cough with yellow sputum',       severities:['MILD','MODERATE','SEVERE'] },
  { code:'R06.0',  desc:'Dyspnoea on exertion',                      severities:['MILD','MODERATE','SEVERE'] },
  { code:'R50.9',  desc:'Fever of unknown origin',                   severities:['MODERATE','SEVERE'] },
  { code:'R51',    desc:'Headache',                                   severities:['MILD','MODERATE','SEVERE'] },
  { code:'R10.9',  desc:'Abdominal pain, unspecified',               severities:['MILD','MODERATE','SEVERE'] },
  { code:'R11',    desc:'Nausea and vomiting',                       severities:['MILD','MODERATE'] },
  { code:'R73.9',  desc:'Hyperglycaemia',                            severities:['MODERATE','SEVERE'] },
  { code:'I10-S',  desc:'Severe headache with elevated BP',          severities:['SEVERE','CRITICAL'] },
  { code:'R07.4',  desc:'Chest pain',                                severities:['MODERATE','SEVERE','CRITICAL'] },
  { code:'R55',    desc:'Syncope and collapse',                      severities:['MODERATE','SEVERE'] },
  { code:'R00.0',  desc:'Tachycardia',                               severities:['MODERATE','SEVERE'] },
  { code:'R19.7',  desc:'Diarrhoea',                                 severities:['MILD','MODERATE','SEVERE'] },
  { code:'R30.0',  desc:'Dysuria (painful urination)',               severities:['MILD','MODERATE'] },
  { code:'R31',    desc:'Haematuria (blood in urine)',               severities:['MODERATE','SEVERE'] },
  { code:'M54.5',  desc:'Low back pain radiating to legs',           severities:['MILD','MODERATE','SEVERE'] },
  { code:'R20.2',  desc:'Paraesthesia (tingling/numbness)',          severities:['MILD','MODERATE'] },
  { code:'R60.0',  desc:'Bilateral ankle swelling',                  severities:['MILD','MODERATE','SEVERE'] },
  { code:'R21',    desc:'Generalised skin rash',                     severities:['MILD','MODERATE'] },
  { code:'R41.3',  desc:'Memory impairment/confusion',              severities:['MODERATE','SEVERE'] },
  { code:'G43',    desc:'Migraine with visual aura',                 severities:['MODERATE','SEVERE'] },
  { code:'R68.8',  desc:'Generalised body weakness/fatigue',        severities:['MILD','MODERATE','SEVERE'] },
  { code:'R06.2',  desc:'Wheezing',                                  severities:['MILD','MODERATE','SEVERE'] },
  { code:'R02',    desc:'Gangrene of lower limb',                    severities:['SEVERE','CRITICAL'] },
  { code:'R53',    desc:'Malaise and fatigue',                       severities:['MILD','MODERATE'] },
  { code:'R63.0',  desc:'Anorexia (loss of appetite)',              severities:['MILD','MODERATE'] },
];

const DIAGNOSES = [
  { code:'J18.9', name:'Community-acquired Pneumonia',                       type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'E11.9', name:'Type 2 Diabetes Mellitus without complications',     type:'SECONDARY', certainty:'CONFIRMED'  },
  { code:'I10',   name:'Essential Hypertension',                             type:'SECONDARY', certainty:'CONFIRMED'  },
  { code:'B50.9', name:'Plasmodium falciparum malaria, unspecified',         type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'A01.0', name:'Typhoid fever',                                      type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'I21.9', name:'Acute myocardial infarction',                        type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'N18.3', name:'Chronic Kidney Disease Stage 3',                     type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'A15.0', name:'Pulmonary Tuberculosis, smear positive',             type:'PRIMARY',   certainty:'SUSPECTED'  },
  { code:'J45.9', name:'Asthma, unspecified',                                type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'K29.7', name:'Gastritis, unspecified',                             type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'I50.9', name:'Heart Failure, unspecified',                         type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'E78.5', name:'Hyperlipidaemia',                                    type:'SECONDARY', certainty:'CONFIRMED'  },
  { code:'D57.0', name:'Sickle Cell Anaemia with crisis',                    type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'N39.0', name:'Urinary Tract Infection',                            type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'M54.5', name:'Low Back Pain',                                      type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'G40.9', name:'Epilepsy, unspecified',                              type:'PRIMARY',   certainty:'SUSPECTED'  },
  { code:'F32.1', name:'Moderate depressive episode',                        type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'B17.1', name:'Acute Hepatitis B',                                  type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'J06.9', name:'Acute URTI',                                         type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'E03.9', name:'Hypothyroidism, unspecified',                        type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'K80.2', name:'Calculus of gallbladder with acute cholecystitis',   type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'I25.1', name:'Atherosclerotic heart disease',                      type:'SECONDARY', certainty:'CONFIRMED'  },
  { code:'E11.2', name:'Type 2 DM with Diabetic Nephropathy',                type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'A09',   name:'Acute Gastroenteritis',                              type:'PRIMARY',   certainty:'CONFIRMED'  },
  { code:'M05.9', name:'Rheumatoid Arthritis, unspecified',                  type:'PRIMARY',   certainty:'CONFIRMED'  },
];

const MEDICATIONS = [
  { code:'J01CR02',  name:'Amoxicillin-Clavulanate', dose:'625 mg',  route:'ORAL',          freq:'Twice daily',          dur:'7 days',  ind:'Bacterial infection' },
  { code:'N02BE01',  name:'Paracetamol',              dose:'1 g',     route:'ORAL',          freq:'Three times daily PRN', dur:'5 days',  ind:'Fever and pain' },
  { code:'A10BA02',  name:'Metformin',                dose:'500 mg',  route:'ORAL',          freq:'Twice daily',          dur:'Ongoing', ind:'Type 2 Diabetes' },
  { code:'C03CA01',  name:'Furosemide',               dose:'40 mg',   route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Oedema / Heart Failure' },
  { code:'C07AB02',  name:'Atenolol',                 dose:'50 mg',   route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Hypertension' },
  { code:'C09AA02',  name:'Enalapril',                dose:'5 mg',    route:'ORAL',          freq:'Twice daily',          dur:'Ongoing', ind:'Hypertension / Heart Failure' },
  { code:'B01AC06',  name:'Aspirin',                  dose:'75 mg',   route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Antiplatelet therapy' },
  { code:'C10AA01',  name:'Simvastatin',              dose:'40 mg',   route:'ORAL',          freq:'Once at night',        dur:'Ongoing', ind:'Hyperlipidaemia' },
  { code:'P01BA01',  name:'Chloroquine',              dose:'600 mg',  route:'ORAL',          freq:'Once daily x3 days',   dur:'3 days',  ind:'Uncomplicated malaria' },
  { code:'P01BC01',  name:'Artemether-Lumefantrine',  dose:'80/480mg',route:'ORAL',          freq:'Twice daily x3 days',  dur:'3 days',  ind:'P. falciparum malaria' },
  { code:'J01FA09',  name:'Clarithromycin',           dose:'500 mg',  route:'ORAL',          freq:'Twice daily',          dur:'7 days',  ind:'Respiratory infection' },
  { code:'J01CA04',  name:'Amoxicillin',              dose:'500 mg',  route:'ORAL',          freq:'Three times daily',    dur:'7 days',  ind:'Infection' },
  { code:'J01DD04',  name:'Ceftriaxone',              dose:'2 g',     route:'INTRAVENOUS',   freq:'Once daily',           dur:'5 days',  ind:'Severe infection' },
  { code:'A02BC01',  name:'Omeprazole',               dose:'20 mg',   route:'ORAL',          freq:'Once daily',           dur:'4 weeks', ind:'Gastritis / PUD' },
  { code:'R06AX13',  name:'Loratadine',               dose:'10 mg',   route:'ORAL',          freq:'Once daily',           dur:'2 weeks', ind:'Allergic rhinitis' },
  { code:'H02AB07',  name:'Prednisolone',             dose:'30 mg',   route:'ORAL',          freq:'Once daily',           dur:'5 days',  ind:'Inflammatory condition' },
  { code:'J04AB02',  name:'Rifampicin',               dose:'600 mg',  route:'ORAL',          freq:'Once daily',           dur:'6 months',ind:'Pulmonary Tuberculosis' },
  { code:'J04AC01',  name:'Isoniazid',                dose:'300 mg',  route:'ORAL',          freq:'Once daily',           dur:'6 months',ind:'Pulmonary Tuberculosis' },
  { code:'N03AX09',  name:'Lamotrigine',              dose:'100 mg',  route:'ORAL',          freq:'Twice daily',          dur:'Ongoing', ind:'Epilepsy' },
  { code:'N06AA02',  name:'Imipramine',               dose:'25 mg',   route:'ORAL',          freq:'Three times daily',    dur:'12 weeks',ind:'Depression' },
  { code:'A10BB01',  name:'Glibenclamide',            dose:'5 mg',    route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Type 2 Diabetes' },
  { code:'C08CA01',  name:'Amlodipine',               dose:'5 mg',    route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Hypertension' },
  { code:'C03DA01',  name:'Spironolactone',           dose:'25 mg',   route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Heart Failure / Oedema' },
  { code:'M01AB05',  name:'Diclofenac',               dose:'75 mg',   route:'INTRAMUSCULAR', freq:'Twice daily',          dur:'3 days',  ind:'Pain and inflammation' },
  { code:'N02AX02',  name:'Tramadol',                 dose:'50 mg',   route:'ORAL',          freq:'Three times daily PRN',dur:'5 days',  ind:'Moderate-severe pain' },
  { code:'B03BA01',  name:'Cyanocobalamin (Vit B12)', dose:'1000 mcg',route:'INTRAMUSCULAR', freq:'Weekly x4 then monthly',dur:'Ongoing',ind:'B12 deficiency' },
  { code:'A11CC01',  name:'Ergocalciferol (Vit D)',   dose:'800 IU',  route:'ORAL',          freq:'Once daily',           dur:'3 months',ind:'Vitamin D deficiency' },
  { code:'J01EE01',  name:'Co-trimoxazole',           dose:'960 mg',  route:'ORAL',          freq:'Twice daily',          dur:'5 days',  ind:'UTI / Pneumocystis prophylaxis' },
  { code:'A07AA02',  name:'Nystatin',                 dose:'100000 IU',route:'ORAL',         freq:'Four times daily',     dur:'7 days',  ind:'Oral candidiasis' },
  { code:'C02CA04',  name:'Doxazosin',                dose:'4 mg',    route:'ORAL',          freq:'Once daily',           dur:'Ongoing', ind:'Hypertension / BPH' },
];

const LAB_PANELS = [
  {
    code:'FBC', name:'Full Blood Count', specimen:'Venous blood',
    analytes:[
      { code:'WBC',  name:'White Blood Cell Count', unit:'×10⁹/L', range:'4.0–11.0',  low:3,   high:25  },
      { code:'HGB',  name:'Haemoglobin',             unit:'g/dL',   range:'12.0–17.5', low:6,   high:20  },
      { code:'PLT',  name:'Platelet Count',          unit:'×10⁹/L', range:'150–400',   low:50,  high:700 },
      { code:'RBC',  name:'Red Blood Cell Count',    unit:'×10¹²/L',range:'4.2–5.9',   low:2,   high:8   },
    ]
  },
  {
    code:'LFT', name:'Liver Function Test', specimen:'Venous blood',
    analytes:[
      { code:'ALT',  name:'Alanine Aminotransferase', unit:'U/L',   range:'7–56',      low:5,   high:500 },
      { code:'AST',  name:'Aspartate Aminotransferase',unit:'U/L',  range:'10–40',     low:5,   high:400 },
      { code:'ALP',  name:'Alkaline Phosphatase',     unit:'U/L',   range:'44–147',    low:30,  high:600 },
      { code:'TBIL', name:'Total Bilirubin',           unit:'μmol/L',range:'3.4–20.5', low:2,   high:150 },
    ]
  },
  {
    code:'RFT', name:'Renal Function Test', specimen:'Venous blood',
    analytes:[
      { code:'CREAT',name:'Creatinine',     unit:'μmol/L', range:'62–106',   low:40,  high:900 },
      { code:'BUN',  name:'Blood Urea Nitrogen',unit:'mmol/L',range:'2.5–7.1',low:1,  high:40  },
      { code:'K',    name:'Potassium',      unit:'mmol/L', range:'3.5–5.0',  low:2.5, high:7   },
      { code:'NA',   name:'Sodium',         unit:'mmol/L', range:'136–145',  low:120, high:160 },
    ]
  },
  {
    code:'LIPID', name:'Lipid Profile', specimen:'Fasting venous blood',
    analytes:[
      { code:'TCHOL',name:'Total Cholesterol',   unit:'mmol/L',range:'<5.2',   low:2,   high:10  },
      { code:'LDL',  name:'LDL Cholesterol',     unit:'mmol/L',range:'<3.4',   low:0.5, high:8   },
      { code:'HDL',  name:'HDL Cholesterol',     unit:'mmol/L',range:'>1.0',   low:0.5, high:3   },
      { code:'TRIG', name:'Triglycerides',        unit:'mmol/L',range:'<1.7',   low:0.5, high:10  },
    ]
  },
  {
    code:'HBA1C', name:'HbA1c (Glycated Haemoglobin)', specimen:'Venous blood',
    analytes:[
      { code:'HBA1C',name:'HbA1c',               unit:'%',     range:'4.0–5.6',  low:4,   high:15  },
    ]
  },
  {
    code:'MPRDT', name:'Malaria Parasite RDT', specimen:'Finger-prick blood',
    analytes:[
      { code:'MPX',  name:'Malaria Parasite (RDT)', unit:'',   range:'Negative', low:0,   high:1   },
    ]
  },
  {
    code:'URE', name:'Urinalysis + Culture', specimen:'Midstream urine',
    analytes:[
      { code:'WBC-U',name:'WBC in Urine',         unit:'cells/hpf',range:'0–5',  low:0,   high:100 },
      { code:'NIT',  name:'Nitrites',              unit:'',     range:'Negative', low:0,   high:1   },
    ]
  },
  {
    code:'TFT', name:'Thyroid Function Test', specimen:'Venous blood',
    analytes:[
      { code:'TSH',  name:'Thyroid Stimulating Hormone',unit:'mIU/L',range:'0.4–4.0',low:0.01,high:50},
      { code:'FT4',  name:'Free Thyroxine (FT4)', unit:'pmol/L',range:'12–22',   low:5,   high:50  },
    ]
  },
  {
    code:'CRP', name:'C-Reactive Protein', specimen:'Venous blood',
    analytes:[
      { code:'CRP',  name:'C-Reactive Protein',   unit:'mg/L',  range:'<10',     low:1,   high:300 },
    ]
  },
  {
    code:'WIDAL', name:'Widal Test (Typhoid)', specimen:'Venous blood',
    analytes:[
      { code:'TO',   name:'Typhi O Titre',         unit:'',     range:'<1:80',   low:0,   high:4   },
      { code:'TH',   name:'Typhi H Titre',         unit:'',     range:'<1:80',   low:0,   high:4   },
    ]
  },
  {
    code:'HIV',   name:'HIV Rapid Test', specimen:'Finger-prick blood',
    analytes:[
      { code:'HIV',  name:'HIV 1/2 Antibody',      unit:'',     range:'Non-reactive',low:0, high:1 },
    ]
  },
  {
    code:'HBSAG', name:'HBsAg Rapid Test', specimen:'Venous blood',
    analytes:[
      { code:'HBSAG',name:'Hepatitis B Surface Antigen',unit:'',range:'Negative', low:0,  high:1   },
    ]
  },
];

const IMAGING_STUDIES = [
  { modality:'XRAY',      site:'Chest (PA)',                    indication:'Suspected pneumonia / cardiac disease',      findings:'Consolidation in right lower lobe.',                impression:'Right lower lobe pneumonia.' },
  { modality:'XRAY',      site:'Left Hand and Wrist',           indication:'Suspected fracture',                         findings:'Linear fracture of 5th metacarpal.',                impression:'Boxer fracture.' },
  { modality:'CT',        site:'Brain (non-contrast)',          indication:'Headache / seizure evaluation',              findings:'No intracranial haemorrhage. Mild cerebral atrophy.',impression:'No acute intracranial pathology.' },
  { modality:'CT',        site:'Abdomen and Pelvis (contrast)', indication:'Abdominal pain evaluation',                  findings:'Enlarged lymph nodes. No free air.',                impression:'Lymphadenopathy; consider infectious/inflammatory cause.' },
  { modality:'MRI',       site:'Lumbar Spine',                  indication:'Low back pain with radiculopathy',           findings:'L4/L5 disc herniation with nerve root compression.',impression:'L4/L5 disc herniation.' },
  { modality:'MRI',       site:'Brain (with contrast)',         indication:'New onset seizures',                         findings:'No mass lesion. Normal signal intensity.',          impression:'Normal brain MRI.' },
  { modality:'ULTRASOUND',site:'Abdomen',                       indication:'RUQ pain / jaundice',                        findings:'Gallstones present. CBD 6 mm. No free fluid.',      impression:'Cholelithiasis.' },
  { modality:'ULTRASOUND',site:'Pelvis (TVS)',                  indication:'Lower abdominal pain',                       findings:'Normal uterus. No adnexal mass.',                   impression:'Normal pelvic ultrasound.' },
  { modality:'ULTRASOUND',site:'Renal (KUB)',                   indication:'Haematuria / renal colic',                   findings:'Right kidney 9.8 cm with mild hydronephrosis.',    impression:'Right hydronephrosis; calculus not excluded.' },
  { modality:'ECG',       site:'12-lead ECG',                   indication:'Chest pain / palpitations',                  findings:'Sinus tachycardia. ST-segment changes in V2-V4.',  impression:'Possible anterior ischaemia; correlate clinically.' },
  { modality:'ECHO',      site:'Transthoracic Echo',            indication:'Heart failure evaluation',                   findings:'EF 35%. Dilated left ventricle. Mild MR.',         impression:'Dilated cardiomyopathy with reduced EF.' },
  { modality:'MAMMOGRAPHY',site:'Both Breasts',                 indication:'Routine screening',                          findings:'No mass or calcification.',                         impression:'Normal bilateral mammogram (BIRADS 1).' },
];

const PROCEDURES = [
  { code:'94760',  name:'Pulse Oximetry',                 ind:'SpO2 monitoring',                 finding:'SpO2 96–99% on room air', outcome:'Stable; no supplemental O2 needed' },
  { code:'36415',  name:'Venepuncture (Blood Draw)',       ind:'Laboratory specimen collection',  finding:'Successful venous access',  outcome:'Specimen collected without complication' },
  { code:'71046',  name:'Chest X-Ray (2 views)',           ind:'Respiratory illness evaluation',  finding:'See radiology report',      outcome:'Study completed' },
  { code:'93000',  name:'12-Lead ECG',                     ind:'Cardiac rhythm evaluation',       finding:'See cardiology report',     outcome:'Tracing obtained and reviewed' },
  { code:'99000',  name:'IV Cannulation',                  ind:'IV access for medication / fluids',finding:'16G cannula, right antecubital',outcome:'Patent IV access; drip commenced' },
  { code:'31500',  name:'Nasopharyngeal Swab',             ind:'Infection screen',                finding:'Specimen collected',        outcome:'Sent to microbiology' },
  { code:'51700',  name:'Bladder Catheterisation',         ind:'Urinary retention / fluid monitoring',finding:'200 mL residual urine drained',outcome:'Catheter patent and draining' },
  { code:'43239',  name:'Upper GI Endoscopy',              ind:'Haematemesis / epigastric pain',  finding:'Gastric ulcer at incisura angularis',outcome:'Biopsy taken; haemostasis achieved' },
  { code:'43235',  name:'Oesophagogastroduodenoscopy (OGD)',ind:'Dyspepsia evaluation',           finding:'Mild erosive gastritis',    outcome:'H. pylori biopsy sent' },
  { code:'29530',  name:'Wound Dressing',                  ind:'Post-op wound care',              finding:'Clean wound, no discharge', outcome:'Dressing applied; reviewed next day' },
  { code:'30901',  name:'Anterior Nasal Packing',          ind:'Epistaxis',                       finding:'Anterior bleeding vessel',  outcome:'Bleeding controlled' },
  { code:'43752',  name:'Nasogastric Tube Insertion',      ind:'Enteral nutrition / gastric decompression',finding:'NGT confirmed on CXR',outcome:'Feeds commenced at 30 mL/h' },
  { code:'11042',  name:'Wound Debridement',               ind:'Infected diabetic foot ulcer',    finding:'Necrotic tissue excised',   outcome:'Wound bed improved; wound care continued' },
  { code:'69209',  name:'Ear Syringing',                   ind:'Impacted cerumen',                finding:'Dense cerumen impaction bilateral',outcome:'Wax removed; hearing improved' },
  { code:'27370',  name:'Bone Marrow Aspiration',          ind:'Anaemia workup / haematological disorder',finding:'Hypercellular marrow',outcome:'Sample sent for cytology' },
];

const NOTE_TEMPLATES = [
  (complaint, dx, meds) => [
    `S: Patient presents with ${complaint}. History consistent with ${dx}.`,
    `O: Vitals as charted. Physical examination findings support working diagnosis.`,
    `A: ${dx}. Background comorbidities noted.`,
    `P: Initiated ${meds}. Patient counselled on medication adherence and follow-up.`,
  ].join('\n'),
  (complaint, dx, meds) => [
    `Subjective: ${complaint}. Symptom onset was gradual over the past few days.`,
    `Objective: Examination reveals pertinent positive findings consistent with ${dx}.`,
    `Assessment: Primary diagnosis of ${dx} confirmed. Secondary diagnoses managed.`,
    `Plan: ${meds} prescribed. Review in 1–2 weeks or earlier if symptoms worsen.`,
  ].join('\n'),
  (complaint, dx, meds) => [
    `Clinical Summary: Patient presented with ${complaint}.`,
    `Diagnosis established as ${dx} based on clinical examination and investigations.`,
    `Management: ${meds}. Supportive care and patient education provided.`,
    `Disposition: Discharged with written instructions and follow-up appointment.`,
  ].join('\n'),
];

const OBSERVATION_TYPES = [
  { type:'BMI',           unit:'kg/m²',  interp:['Underweight','Normal','Overweight','Obese'] },
  { type:'Smoking Status', unit:'',      interp:['Never smoker','Ex-smoker (>5 yrs)','Current smoker (light)','Current smoker (heavy)'] },
  { type:'Alcohol Use',    unit:'',      interp:['Non-drinker','Occasional','Moderate','Heavy'] },
  { type:'Blood Pressure', unit:'mmHg',  interp:['Normal','Elevated','Stage 1 HTN','Stage 2 HTN'] },
  { type:'Fasting Glucose',unit:'mmol/L',interp:['Normal','Pre-diabetic','Diabetic range'] },
  { type:'SpO2 Trend',     unit:'%',     interp:['Normal','Borderline — monitor','Low — requires O2'] },
  { type:'Pain Score',     unit:'/10',   interp:['Mild (1–3)','Moderate (4–6)','Severe (7–10)'] },
  { type:'Fluid Balance',  unit:'mL/24h',interp:['Positive balance','Negative balance','Neutral'] },
];

const CARE_PLAN_GOALS = [
  'Achieve and maintain blood pressure < 130/80 mmHg',
  'Maintain fasting blood glucose 4.0–7.0 mmol/L',
  'Achieve HbA1c < 7.0% within 3 months',
  'Resolve acute infection within 2 weeks',
  'Reduce weight by 5% over 6 months',
  'Increase daily physical activity to 30 min x5 days/week',
  'Smoking cessation within 1 month',
  'Improve cardiac function — EF > 40% at 6-month echo',
  'Pain score < 3/10 at rest',
  'Complete full TB treatment course (6 months)',
  'Normalise renal function markers within 3 months',
  'Prevent further vaso-occlusive crisis episodes',
  'Reduce LDL cholesterol < 2.6 mmol/L',
  'Maintain seizure-free state on current medication',
];

const CARE_PLAN_INTERVENTIONS = [
  'Prescribe and titrate antihypertensive therapy',
  'Initiate or optimise oral hypoglycaemic agents',
  'Low-sodium, low-fat dietary counselling',
  'Refer to dietitian for medical nutrition therapy',
  'Commence antibiotic therapy as per culture results',
  'IV fluid resuscitation and electrolyte correction',
  'Cardiac rehabilitation programme referral',
  'Wound care and offloading for diabetic foot',
  'Physiotherapy referral for musculoskeletal pain',
  'Smoking cessation counselling and nicotine replacement',
  'TB treatment with DOTS (Directly Observed Therapy)',
  'Regular HbA1c and renal function monitoring',
  'Patient education on medication adherence',
  'Follow-up in 4–6 weeks or earlier if deterioration',
];

const ENCOUNTER_TYPES = ['OUTPATIENT','OUTPATIENT','OUTPATIENT','INPATIENT','EMERGENCY','TELEMEDICINE'];
const DISPOSITIONS = ['DISCHARGED','DISCHARGED','DISCHARGED','ADMITTED','REFERRED','ONGOING'];
const OUTCOME_STATUSES = ['IMPROVED','IMPROVED','STABLE','RECOVERED','DETERIORATED'];

// ---------------------------------------------------------------------------
// Patient generation
// ---------------------------------------------------------------------------

function generatePatients(count) {
  const patients = [];
  for (let i = 1; i <= count; i++) {
    const sex = pick(SEX_POOL);
    const firstName = sex === 'MALE' ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
    const lastName = pick(LAST_NAMES);
    const middleName = pick(MIDDLE_NAMES);
    const dob = randDate(new Date('1940-01-01'), new Date('2005-12-31'));
    const height = randFloat(145, 195, 1);
    const weight = randFloat(40, 120, 1);
    const deceased = Math.random() < 0.05;

    patients.push({
      medicalRecordNumber: `MRN-2020-${pad(i)}`,
      firstName,
      middleName: middleName || undefined,
      lastName,
      dateOfBirth: dob,
      sex,
      bloodGroup: pick(BLOOD_GROUPS),
      genotype: pick(GENOTYPES),
      baselineHeightCm: height,
      baselineWeightKg: weight,
      deceased,
      deceasedDate: deceased ? randDate(new Date('2021-01-01'), new Date('2024-12-31')) : undefined,
      organDonor: Math.random() < 0.3 ? true : (Math.random() < 0.5 ? false : null),
    });
  }
  return patients;
}

// ---------------------------------------------------------------------------
// Encounter seeding
// ---------------------------------------------------------------------------

async function seedEncounter(patient, encounter) {
  const baseTime = encounter.encounterDateTime;

  // Symptoms
  const chosenSymptoms = pickMany(SYMPTOMS, 2, 4);
  await prisma.symptom.createMany({
    data: chosenSymptoms.map(s => ({
      encounterId: encounter.id,
      symptomCode: s.code,
      symptomDescription: s.desc,
      onsetDate: addDays(baseTime, -randInt(1, 10)),
      severity: pick(s.severities),
      durationDays: randInt(1, 14),
      progression: pick(['Worsening','Stable','Improving','Fluctuating']),
    })),
  });

  // Vital signs
  const heightCm = patient.baselineHeightCm ?? randFloat(150, 185, 1);
  const weightKg = patient.baselineWeightKg ?? randFloat(50, 100, 1);
  const bmi = parseFloat((weightKg / ((heightCm / 100) ** 2)).toFixed(1));
  await prisma.vitalSigns.create({
    data: {
      encounterId: encounter.id,
      recordedAt: baseTime,
      temperatureCelsius: randFloat(36.2, 40.1, 1),
      pulseRateBpm: randInt(50, 130),
      respiratoryRate: randInt(14, 28),
      bpSystolic: randInt(90, 200),
      bpDiastolic: randInt(60, 120),
      oxygenSaturationPercent: randFloat(88, 100, 1),
      bloodGlucoseMgDl: randInt(60, 400),
      weightKg,
      heightCm,
      bmi,
      painScore: randInt(0, 10),
    },
  });

  // Diagnoses
  const diagPool = pickMany(DIAGNOSES, 1, 3);
  const createdDiagnoses = [];
  for (const d of diagPool) {
    const diag = await prisma.diagnosis.create({
      data: {
        encounterId: encounter.id,
        diagnosisCode: d.code,
        diagnosisName: d.name,
        diagnosisType: d.type,
        certainty: d.certainty,
        diagnosedAt: baseTime,
      },
    });
    createdDiagnoses.push(diag);
  }

  // Clinical note
  const primaryDx = diagPool[0];
  const medNames = pickMany(MEDICATIONS, 1, 3).map(m => m.name).join(', ');
  const chiefComplaint = encounter.chiefComplaint ?? 'presenting complaint';
  const noteTemplate = pick(NOTE_TEMPLATES);
  await prisma.clinicalNote.create({
    data: {
      encounterId: encounter.id,
      noteType: pick(['SOAP','SOAP','PROGRESS','CONSULTATION']),
      noteText: noteTemplate(chiefComplaint, primaryDx.name, medNames),
    },
  });

  // Medications
  const chosenMeds = pickMany(MEDICATIONS, 2, 4);
  const encDate = encounter.encounterDateTime;
  await prisma.medication.createMany({
    data: chosenMeds.map(m => ({
      encounterId: encounter.id,
      drugCode: m.code,
      drugName: m.name,
      dosage: m.dose,
      route: m.route,
      frequency: m.freq,
      duration: m.dur,
      indication: m.ind,
      startDate: encDate,
      endDate: m.dur !== 'Ongoing' ? addDays(encDate, randInt(3, 30)) : undefined,
    })),
  });

  // Lab orders (1–2 panels)
  const chosenPanels = pickMany(LAB_PANELS, 1, 2);
  for (const panel of chosenPanels) {
    const labOrder = await prisma.labOrder.create({
      data: {
        encounterId: encounter.id,
        testCode: panel.code,
        testName: panel.name,
        specimenType: panel.specimen,
        priority: pick(['ROUTINE','URGENT','STAT']),
        orderedAt: baseTime,
      },
    });

    const analytes = pickMany(panel.analytes, 1, panel.analytes.length);
    await prisma.labResult.createMany({
      data: analytes.map(a => {
        const val = randFloat(a.low, a.high, 1);
        const [lo, hi] = a.range.replace('<','0–').replace('>','').split('–').map(Number);
        const abnormal = lo && hi ? (val < lo || val > hi) : Math.random() < 0.3;
        return {
          labOrderId: labOrder.id,
          analyteCode: a.code,
          analyteName: a.name,
          resultValue: String(val),
          unit: a.unit,
          referenceRange: a.range,
          abnormalFlag: abnormal,
          resultStatus: 'COMPLETED',
          resultedAt: addHours(baseTime, randInt(1, 6)),
        };
      }),
    });
  }

  // Imaging (50% chance)
  if (Math.random() < 0.5) {
    const study = pick(IMAGING_STUDIES);
    const imagingOrder = await prisma.imagingOrder.create({
      data: {
        encounterId: encounter.id,
        modality: study.modality,
        bodySite: study.site,
        clinicalIndication: study.indication,
        orderedAt: baseTime,
      },
    });
    await prisma.imagingReport.create({
      data: {
        imagingOrderId: imagingOrder.id,
        findings: study.findings,
        impression: study.impression,
        reportedAt: addHours(baseTime, randInt(2, 8)),
      },
    });
  }

  // Procedures (0–2)
  const procCount = randInt(0, 2);
  if (procCount > 0) {
    const chosenProcs = pickMany(PROCEDURES, procCount, procCount);
    for (const proc of chosenProcs) {
      await prisma.procedure.create({
        data: {
          encounterId: encounter.id,
          procedureCode: proc.code,
          procedureName: proc.name,
          indication: proc.ind,
          findings: proc.finding,
          outcome: proc.outcome,
          performedAt: addHours(baseTime, randInt(0, 3)),
        },
      });
    }
  }

  // Clinical outcome
  await prisma.clinicalOutcome.create({
    data: {
      encounterId: encounter.id,
      outcomeType: encounter.disposition === 'DISCHARGED' ? 'Discharge' : 'Inpatient stay',
      outcomeStatus: pick(OUTCOME_STATUSES),
      recoveryStatus: pick(['Full recovery','Partial — follow-up scheduled','Ongoing management required','Referred to specialist']),
      complicationFlag: Math.random() < 0.15,
      mortalityFlag: encounter.disposition === 'DECEASED',
      recordedAt: addHours(baseTime, randInt(3, 12)),
    },
  });

  // Encounter-level observations (1–2)
  const obsCount = randInt(1, 2);
  const obsTypes = pickMany(OBSERVATION_TYPES, obsCount, obsCount);
  await prisma.observation.createMany({
    data: obsTypes.map(o => ({
      patientId: patient.id,
      encounterId: encounter.id,
      observationType: o.type,
      value: String(randFloat(1, 100, 1)),
      unit: o.unit,
      interpretation: pick(o.interp),
      observedAt: baseTime,
    })),
  });

  return createdDiagnoses[0] ?? null;
}

// ---------------------------------------------------------------------------
// Patient seeding
// ---------------------------------------------------------------------------

async function seedPatient(patientData) {
  const patient = await prisma.patient.create({ data: patientData });

  // Allergies (2–4)
  const chosenAllergens = pickMany(ALLERGENS, 2, 4);
  await prisma.allergy.createMany({
    data: chosenAllergens.map(a => ({
      patientId: patient.id,
      allergen: a.allergen,
      reaction: a.reaction,
      severity: a.severity,
      onsetDate: randDate(new Date('2005-01-01'), new Date('2022-12-31')),
      status: a.status,
    })),
  });

  // Medical history (2–4)
  const chosenConditions = pickMany(CONDITIONS, 2, 4);
  await prisma.medicalHistory.createMany({
    data: chosenConditions.map(c => ({
      patientId: patient.id,
      conditionCode: c.code,
      conditionName: c.name,
      diagnosisDate: randDate(new Date('2000-01-01'), new Date('2022-12-31')),
      chronicity: c.chronicity,
      familyHistory: c.family,
    })),
  });

  // Immunizations (3–5)
  const chosenVaccines = pickMany(VACCINES, 3, 5);
  await prisma.immunization.createMany({
    data: chosenVaccines.map(v => ({
      patientId: patient.id,
      vaccineCode: v.code,
      vaccineName: v.name,
      doseNumber: randInt(v.minDose, v.maxDose),
      administrationDate: randDate(new Date('2000-01-01'), new Date('2024-06-30')),
    })),
  });

  // Patient-level observations (2–4)
  const chosenObsTypes = pickMany(OBSERVATION_TYPES, 2, 4);
  await prisma.observation.createMany({
    data: chosenObsTypes.map(o => ({
      patientId: patient.id,
      observationType: o.type,
      value: String(randFloat(1, 100, 1)),
      unit: o.unit,
      interpretation: pick(o.interp),
      observedAt: randDate(new Date('2023-01-01'), new Date('2024-12-31')),
    })),
  });

  // Encounters (3–6)
  const numEncounters = randInt(3, 6);
  const encounterDates = Array.from({ length: numEncounters }, () =>
    randDate(new Date('2020-01-01'), new Date('2024-11-30'))
  ).sort((a, b) => a - b);

  const chiefComplaints = [
    'Persistent cough and shortness of breath',
    'Fever, chills, and body aches for 3 days',
    'Severe headache and blurred vision',
    'Abdominal pain, nausea, and vomiting',
    'Chest pain and palpitations',
    'Generalised body weakness and fatigue',
    'Dysuria and increased urinary frequency',
    'Low back pain radiating to right leg',
    'Rash and pruritus for 2 weeks',
    'Loss of appetite, weight loss, and night sweats',
    'Swelling of both legs for 1 week',
    'Diarrhoea and vomiting for 2 days',
    'High blood sugar readings at home',
    'Uncontrolled blood pressure despite medications',
    'Joint pain and morning stiffness',
    'Convulsions and loss of consciousness',
    'Productive cough with blood-tinged sputum',
    'Blurred vision and eye pain',
    'Difficulty swallowing and heartburn',
    'Wound infection not healing',
  ];

  const firstDiagnosisOfPatient = { value: null };

  for (const dt of encounterDates) {
    const type = pick(ENCOUNTER_TYPES);
    const disposition = type === 'INPATIENT' ? pick(['ADMITTED','REFERRED','TRANSFERRED']) :
                        type === 'EMERGENCY' ? pick(['ADMITTED','DISCHARGED','REFERRED']) :
                        pick(['DISCHARGED','REFERRED','ONGOING']);
    const encounter = await prisma.encounter.create({
      data: {
        patientId: patient.id,
        encounterType: type,
        encounterDateTime: dt,
        chiefComplaint: pick(chiefComplaints),
        clinicalSummary: `Patient presented to the ${type.toLowerCase()} department. Examination and investigations completed.`,
        disposition,
      },
    });
    const firstDiag = await seedEncounter(patient, encounter);
    if (!firstDiagnosisOfPatient.value && firstDiag) {
      firstDiagnosisOfPatient.value = firstDiag;
    }
  }

  // Care plans (1–3)
  const numCarePlans = randInt(1, 3);
  for (let i = 0; i < numCarePlans; i++) {
    const goals = pickMany(CARE_PLAN_GOALS, 2, 4);
    const interventions = pickMany(CARE_PLAN_INTERVENTIONS, 3, 5);
    await prisma.carePlan.create({
      data: {
        patientId: patient.id,
        diagnosisId: i === 0 ? (firstDiagnosisOfPatient.value?.id ?? null) : null,
        goals,
        interventions,
        monitoringPlan: pick([
          'Monthly clinic review with BP and blood glucose monitoring.',
          'Biweekly wound assessment and dressing changes.',
          'Weekly LFT and RFT monitoring during treatment.',
          'Three-monthly HbA1c, lipid panel, and renal function.',
          'Monthly weight, fluid balance, and electrolyte monitoring.',
          'Six-monthly echo and BNP for cardiac function assessment.',
        ]),
        reviewDate: addDays(new Date(), randInt(14, 90)),
        status: pick(['ACTIVE','ACTIVE','ACTIVE','COMPLETED','ON_HOLD']),
      },
    });
  }

  console.log(`  [${patientData.medicalRecordNumber}] ${patient.firstName} ${patient.lastName}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding EHR data — 200 patients...\n');

  const patients = generatePatients(200);

  // Process in batches of 10 to avoid overwhelming DB connections
  const BATCH_SIZE = 10;
  for (let i = 0; i < patients.length; i += BATCH_SIZE) {
    const batch = patients.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(p => seedPatient(p)));
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(patients.length / BATCH_SIZE)} complete`);
  }

  console.log('\nSeed complete. 200 patients created with full clinical records.');
}

main()
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
