# Smart-Doc API Reference

Base URL: `http://localhost:3000` (configured via `PORT` env var)

All request and response bodies are JSON unless noted. Errors always return `{ "error": "..." }`.

---

## Table of Contents

- [Files](#files)
- [RAG (legacy)](#rag-legacy)
- [Jobs](#jobs)
- [Patients](#patients)
- [Doctor's Notes](#doctors-notes)
- [Search](#search)
- [Health](#health)

---

## Files

### Upload a file

```
POST /files/upload
Content-Type: multipart/form-data
```

**Form fields**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | The document to upload (max 10 MB) |
| `chunkSize` | number | No | Text chunk size in characters (default: 800) |
| `chunkOverlap` | number | No | Overlap between chunks (default: 100) |

**Allowed MIME types:** `application/pdf`, `text/plain`, `text/csv`, `application/json`, `application/msword`, `.docx`, `.xlsx`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`

**Response `202`**
```json
{
  "message": "File uploaded successfully. Ingestion queued.",
  "file": {
    "id": "abc123",
    "name": "report.pdf",
    "size": 204800,
    "type": "application/pdf",
    "uploadDate": "2026-05-07T10:00:00.000Z",
    "status": "PENDING_INGEST",
    "url": "https://..."
  },
  "job": {
    "id": "clxyz...",
    "status": "QUEUED"
  }
}
```

---

### List files

```
GET /files
```

**Response `200`**
```json
{
  "files": [
    {
      "id": "abc123",
      "name": "report.pdf",
      "size": 204800,
      "type": "application/pdf",
      "uploadDate": "2026-05-07T10:00:00.000Z",
      "url": "https://...",
      "status": "READY",
      "latestJob": { "id": "clxyz...", "status": "SUCCEEDED" }
    }
  ]
}
```

**File statuses:** `PENDING_INGEST` · `PROCESSING` · `READY` · `FAILED` · `DELETED`

---

### Get file

```
GET /files/:id
```

**Response `200`**
```json
{
  "id": "abc123",
  "name": "report.pdf",
  "filename": "report.pdf",
  "size": 204800,
  "type": "application/pdf",
  "uploadDate": "2026-05-07T10:00:00.000Z",
  "url": "https://...",
  "status": "READY",
  "jobs": [ { "id": "clxyz...", "status": "SUCCEEDED", ... } ]
}
```

---

### Get file download URL

```
GET /files/:id/download
```

**Response `200`**
```json
{
  "file": {
    "id": "abc123",
    "originalName": "report.pdf",
    "path": "https://...?X-Amz-Expires=..."
  }
}
```

Returns a pre-signed S3 URL valid for a short window.

---

### Get ingest jobs for a file

```
GET /files/:id/jobs
```

**Response `200`**
```json
{
  "jobs": [
    {
      "id": "clxyz...",
      "status": "SUCCEEDED",
      "attemptCount": 1,
      "chunkSize": 800,
      "chunkOverlap": 100,
      "queuedAt": "2026-05-07T10:00:00.000Z",
      "finishedAt": "2026-05-07T10:00:45.000Z",
      "attempts": [ { "attemptNo": 1, "status": "SUCCEEDED", ... } ]
    }
  ]
}
```

---

### Delete file

```
DELETE /files/:id
```

Permanently removes the file from S3, all vectors from Qdrant, and the database record (cascades to ingest jobs and attempts).

**Response `200`**
```json
{
  "message": "File permanently deleted",
  "deletedFile": { "id": "abc123", "name": "report.pdf" }
}
```

---

## RAG (legacy)

> These endpoints are kept for backward compatibility. Prefer `/api/search/*` for new integrations.

### Search documents

```
POST /rag/search
Content-Type: application/json
```

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Natural-language search query |
| `limit` | number | No | Number of results (default: 5) |
| `filter` | object | No | Qdrant payload filter |

**Response `200`**
```json
{
  "results": [
    {
      "id": "uuid",
      "score": 0.91,
      "payload": {
        "fileId": "abc123",
        "filename": "report.pdf",
        "originalName": "report.pdf",
        "chunk": 3,
        "text": "...matching chunk text..."
      }
    }
  ]
}
```

---

### Get vector count for a file

```
GET /rag/status/:fileId
```

**Response `200`**
```json
{ "fileId": "abc123", "vectors": 42 }
```

---

### Get job status (via RAG route)

```
GET /rag/jobs/:jobId
```

Same response shape as `GET /jobs/:jobId`.

---

## Jobs

### Get job

```
GET /jobs/:jobId
```

**Response `200`**
```json
{
  "job": {
    "id": "clxyz...",
    "fileId": "abc123",
    "status": "SUCCEEDED",
    "chunkSize": 800,
    "chunkOverlap": 100,
    "attemptCount": 1,
    "maxAttempts": 3,
    "queuedAt": "2026-05-07T10:00:00.000Z",
    "startedAt": "2026-05-07T10:00:02.000Z",
    "finishedAt": "2026-05-07T10:00:45.000Z",
    "lastErrorCode": null,
    "lastErrorMessage": null,
    "file": { "id": "abc123", "originalName": "report.pdf", ... },
    "attempts": [
      {
        "attemptNo": 1,
        "status": "SUCCEEDED",
        "startedAt": "2026-05-07T10:00:02.000Z",
        "finishedAt": "2026-05-07T10:00:45.000Z",
        "errorCode": null,
        "errorMessage": null,
        "backoffMs": null
      }
    ]
  }
}
```

**Job statuses:** `QUEUED` · `RUNNING` · `RETRY_SCHEDULED` · `SUCCEEDED` · `FAILED` · `CANCELLED`

---

## Patients

### List patients

```
GET /api/patients
```

**Query parameters**

| Param | Type | Description |
|---|---|---|
| `q` | string | Search by MRN, first name, middle name, or last name (case-insensitive) |
| `take` | number | Page size (default: 50, max: 200) |
| `skip` | number | Offset for pagination (default: 0) |

**Response `200`**
```json
{
  "patients": [
    {
      "id": "clxyz...",
      "medicalRecordNumber": "MRN-2020-0001",
      "firstName": "Emeka",
      "middleName": "Chisom",
      "lastName": "Okafor",
      "dateOfBirth": "1975-03-12T00:00:00.000Z",
      "sex": "MALE",
      "deceased": false
    }
  ],
  "total": 200,
  "take": 50,
  "skip": 0
}
```

---

### Get patient details

```
GET /api/patients/:id
```

Returns the full patient record with related clinical data (up to 50 rows per collection).

**Response `200`**
```json
{
  "id": "clxyz...",
  "medicalRecordNumber": "MRN-2020-0001",
  "firstName": "Emeka",
  "middleName": "Chisom",
  "lastName": "Okafor",
  "dateOfBirth": "1975-03-12T00:00:00.000Z",
  "sex": "MALE",
  "bloodGroup": "O_POS",
  "genotype": "AA",
  "baselineHeightCm": 172.5,
  "baselineWeightKg": 74.0,
  "deceased": false,
  "deceasedDate": null,
  "organDonor": true,
  "createdAt": "2026-05-01T00:00:00.000Z",
  "updatedAt": "2026-05-07T00:00:00.000Z",
  "_count": {
    "encounters": 5,
    "allergies": 3,
    "medicalHistory": 4,
    "carePlans": 2,
    "immunizations": 4,
    "observations": 6
  },
  "encounters": [ { "id": "...", "encounterType": "OUTPATIENT", "encounterDateTime": "...", "chiefComplaint": "...", "clinicalSummary": "...", "disposition": "DISCHARGED" } ],
  "allergies": [ { "allergen": "Penicillin", "reaction": "Urticaria", "severity": "HIGH", "status": "ACTIVE", "onsetDate": "..." } ],
  "medicalHistory": [ { "conditionName": "Hypertension", "conditionCode": "I10", "chronicity": "CHRONIC", "familyHistory": true, ... } ],
  "carePlans": [ { "status": "ACTIVE", "goals": ["..."], "interventions": ["..."], "reviewDate": "..." } ],
  "immunizations": [ { "vaccineName": "COVID-19 mRNA Vaccine", "vaccineCode": "COVID19", "doseNumber": 2, "administrationDate": "..." } ],
  "observations": [ { "observationType": "BMI", "value": "26.3", "unit": "kg/m²", "interpretation": "Overweight", "observedAt": "..." } ]
}
```

**Sex values:** `MALE` · `FEMALE` · `INTERSEX` · `UNKNOWN`

**Blood group values:** `A_POS` · `A_NEG` · `B_POS` · `B_NEG` · `AB_POS` · `AB_NEG` · `O_POS` · `O_NEG` · `UNKNOWN`

**Genotype values:** `AA` · `AS` · `SS` · `AC` · `SC` · `UNKNOWN`

---

## Doctor's Notes

Notes are stored as vectors in the `doctor_notes` Qdrant collection. Each note is embedded whole (no chunking) using Gemini `gemini-embedding-001` (768 dimensions).

### Save a doctor's note

```
POST /api/patients/:id/notes
Content-Type: application/json
```

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `encounterId` | string | Yes | ID of the encounter this note belongs to |
| `noteText` | string | Yes | Full text of the note |
| `noteType` | string | No | Note category (default: `DOCTORS_NOTE`) |

**noteType values:** `DOCTORS_NOTE` · `SOAP` · `PROGRESS` · `CONSULTATION` · `DISCHARGE`

**Response `201`**
```json
{
  "id": "uuid-of-qdrant-point",
  "patientId": "clxyz...",
  "encounterId": "clxyz...",
  "noteType": "SOAP",
  "createdAt": "2026-05-07T10:30:00.000Z"
}
```

---

### Get doctor's notes for a patient

```
GET /api/patients/:id/notes
```

**Query parameters**

| Param | Type | Description |
|---|---|---|
| `encounterId` | string | Filter notes to a specific encounter |

**Response `200`** — array sorted newest-first
```json
[
  {
    "id": "uuid-of-qdrant-point",
    "patientId": "clxyz...",
    "encounterId": "clxyz...",
    "noteText": "Patient presents with productive cough...",
    "noteType": "SOAP",
    "createdAt": "2026-05-07T10:30:00.000Z"
  }
]
```

---

## Search

Embeds the query using Gemini `gemini-embedding-001` and performs a cosine-similarity search against the specified Qdrant collection.

### Search documents

```
POST /api/search/documents
Content-Type: application/json
```

**Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Natural-language search query |
| `limit` | number | No | Number of results, 1–50 (default: 5) |
| `filter` | object | No | Qdrant payload filter (e.g. `{ "must": [{ "key": "fileId", "match": { "value": "abc" } }] }`) |

**Response `200`**
```json
{
  "query": "patient chest pain investigation",
  "limit": 5,
  "collection": "documents",
  "total": 3,
  "results": [
    {
      "id": "uuid",
      "score": 0.91,
      "payload": {
        "fileId": "abc123",
        "filename": "cardiology-report.pdf",
        "originalName": "cardiology-report.pdf",
        "chunk": 2,
        "text": "...matching chunk text..."
      }
    }
  ]
}
```

---

### Search doctor's notes

```
POST /api/search/doctor-notes
Content-Type: application/json
```

**Body** — same fields as `/api/search/documents`

**Response `200`**
```json
{
  "query": "hypertension poorly controlled",
  "limit": 5,
  "collection": "doctor_notes",
  "total": 2,
  "results": [
    {
      "id": "uuid",
      "score": 0.88,
      "payload": {
        "patientId": "clxyz...",
        "encounterId": "clxyz...",
        "noteText": "Patient presents with uncontrolled hypertension...",
        "noteType": "PROGRESS",
        "createdAt": "2026-05-07T10:30:00.000Z"
      }
    }
  ]
}
```

**Qdrant filter example — restrict to a specific patient:**
```json
{
  "query": "chest pain",
  "limit": 10,
  "filter": {
    "must": [
      { "key": "patientId", "match": { "value": "clxyz..." } }
    ]
  }
}
```

---

## Health

```
GET /health
```

**Response `200`**
```json
{ "status": "OK", "message": "File server is running" }
```

---

## Common error responses

| Status | Body | Meaning |
|---|---|---|
| `400` | `{ "error": "query is required" }` | Missing or invalid request field |
| `404` | `{ "error": "Patient not found" }` | Resource does not exist |
| `500` | `{ "error": "Internal server error" }` | Unexpected server-side failure |
