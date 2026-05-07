# Smart-Doc Agent API

A focused, query-only HTTP surface designed for **remote AI agents** (LLMs, MCP clients, autonomous workflows) to read clinical data from the Smart-Doc EHR.

- **Base URL:** `http://localhost:3000` (configurable via `PORT`)
- **Prefix:** all endpoints in this document live under `/agent`.
- **Format:** JSON in, JSON out. Errors always return `{ "error": "..." }` (occasionally with a `code` field).
- **Auth:** none in the current build (intended for trusted networks).
- **Read-only:** every endpoint here is a query/lookup. No writes, no uploads.

> For file uploads, ingestion jobs, and writing doctor notes, see the main [API.md](API.md). The agent API is intentionally narrower.

---

## Table of contents

1. [Tool discovery](#tool-discovery)
2. [Health](#health)
3. [RAG vector search](#rag-vector-search)
   - [Search documents](#search-documents)
   - [Search doctor notes](#search-doctor-notes)
   - [Qdrant filter recipes](#qdrant-filter-recipes)
4. [Patient utilities](#patient-utilities)
   - [List patients](#list-patients)
   - [Get by MRN](#get-by-mrn)
   - [Patient summary](#patient-summary)
   - [Encounters](#encounters)
   - [Get encounter](#get-encounter)
   - [Allergies](#allergies)
   - [Medical history](#medical-history)
   - [Care plans](#care-plans)
   - [Immunizations](#immunizations)
   - [Observations](#observations)
   - [Medications](#medications)
   - [Lab results](#lab-results)
   - [Vitals](#vitals)
5. [Text-to-SQL](#text-to-sql)
   - [Get schema](#get-schema)
   - [Run SQL query](#run-sql-query)
   - [SQL guardrails](#sql-guardrails)
6. [Sample tool definitions](#sample-tool-definitions)
   - [OpenAI / function-calling](#openai--function-calling)
   - [Anthropic / tool-use](#anthropic--tool-use)
   - [MCP-style](#mcp-style)
7. [Common errors](#common-errors)
8. [Production hardening](#production-hardening)

---

## Tool discovery

### `GET /agent/tools`

Returns the full catalog of tools the agent can call, including name, HTTP method, path template, and input schema. Use this on agent boot to dynamically build a tool list.

**Response `200`**

```json
{
  "baseUrl": "http://localhost:3000",
  "count": 17,
  "tools": [
    {
      "name": "search_documents",
      "description": "Semantic vector search across uploaded clinical documents...",
      "method": "POST",
      "path": "/agent/rag/search-documents",
      "input": {
        "query":  { "type": "string",  "required": true },
        "limit":  { "type": "integer", "required": false, "default": 5, "min": 1, "max": 50 },
        "patientId": { "type": "string", "required": false },
        "fileId":    { "type": "string", "required": false },
        "filter":    { "type": "object", "required": false }
      }
    }
  ]
}
```

---

## Health

### `GET /agent/health`

Pings Postgres and Qdrant. Useful as a readiness probe before the agent starts a multi-step task.

**Response `200`**

```json
{
  "status": "OK",
  "checks": { "server": "ok", "database": "ok", "qdrant": "ok (3 collections)" }
}
```

**Response `503`** if any dependency fails — same shape, with `status: "DEGRADED"` and the failure message in the corresponding `checks.*` field.

---

## RAG vector search

Query embeddings are produced with Google's `gemini-embedding-001` (768-dim, cosine), then matched against Qdrant. All endpoints accept the same response shape:

```json
{
  "query":      "string",
  "limit":      5,
  "collection": "documents",
  "total":      3,
  "results": [
    { "id": "uuid", "score": 0.91, "payload": { ... } }
  ]
}
```

### Search documents

```
POST /agent/rag/search-documents
Content-Type: application/json
```

**Body**

| Field       | Type    | Required | Description |
|---          |---      |---        |---|
| `query`     | string  | Yes      | Natural-language query. |
| `limit`     | number  | No       | 1–50, default 5. |
| `patientId` | string  | No       | Convenience filter — restrict to chunks whose payload has this `patientId`. |
| `fileId`    | string  | No       | Convenience filter — restrict to a single source file. |
| `filter`    | object  | No       | Raw Qdrant filter ([docs](https://qdrant.tech/documentation/concepts/filtering/)). Combined with the convenience filters via `must`. |

**Example**

```bash
curl -sX POST http://localhost:3000/agent/rag/search-documents \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "history of myocardial infarction",
    "limit": 3,
    "patientId": "ckxabc123"
  }'
```

**Response payload fields** (chunks of ingested documents):

```json
{
  "fileId": "abc123",
  "filename": "cardiology-report.pdf",
  "originalName": "cardiology-report.pdf",
  "chunk": 4,
  "text": "...matching chunk text..."
}
```

### Search doctor notes

```
POST /agent/rag/search-doctor-notes
Content-Type: application/json
```

**Body**

| Field         | Type   | Required | Description |
|---            |---     |---       |---|
| `query`       | string | Yes      | Natural-language query. |
| `limit`       | number | No       | 1–50, default 5. |
| `patientId`   | string | No       | Restrict to one patient's notes. |
| `encounterId` | string | No       | Restrict to one encounter's notes. |
| `filter`      | object | No       | Raw Qdrant filter. |

**Response payload fields:**

```json
{
  "patientId": "ckxabc123",
  "encounterId": "ckxenc456",
  "noteText": "Patient presents with productive cough...",
  "noteType": "PROGRESS",
  "createdAt": "2026-05-07T10:30:00.000Z"
}
```

### Qdrant filter recipes

The convenience params (`patientId`, `encounterId`, `fileId`) are compiled into a `must` clause. You can still send a raw `filter`; it is merged with them. Examples below use raw filters explicitly.

**Restrict by patient + minimum score (server-side filter for score is not available; filter on payload only):**

```json
{
  "query": "uncontrolled hypertension",
  "limit": 10,
  "filter": { "must": [ { "key": "patientId", "match": { "value": "ckxabc123" } } ] }
}
```

**Restrict to a date range (string match isn't great here; for ranges use SQL or pre-filter by encounterId):**

```json
{
  "filter": {
    "must": [
      { "key": "patientId", "match": { "value": "ckxabc123" } },
      { "key": "noteType",  "match": { "value": "SOAP" } }
    ]
  }
}
```

**Combine OR conditions:**

```json
{
  "filter": {
    "should": [
      { "key": "noteType", "match": { "value": "SOAP" } },
      { "key": "noteType", "match": { "value": "PROGRESS" } }
    ]
  }
}
```

---

## Patient utilities

All paths require an existing, non-soft-deleted patient. A missing or deleted patient returns `404`.

### List patients

```
GET /agent/patients?q=&take=&skip=
```

| Param  | Type    | Description |
|---     |---      |---|
| `q`    | string  | Substring match (case-insensitive) on MRN, first / middle / last name. |
| `take` | integer | Page size, default 50, max 200. |
| `skip` | integer | Offset. |

**Response `200`**

```json
{
  "patients": [
    {
      "id": "ckxabc123",
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

### Get by MRN

```
GET /agent/patients/by-mrn/:mrn
```

Returns the full `Patient` row. `404` if the MRN does not exist.

### Patient summary

```
GET /agent/patients/:id/summary
```

Cheap call returning the `Patient` row plus relation counts.

```json
{
  "id": "ckxabc123",
  "medicalRecordNumber": "MRN-2020-0001",
  "firstName": "Emeka",
  "lastName": "Okafor",
  "sex": "MALE",
  "dateOfBirth": "1975-03-12T00:00:00.000Z",
  "_count": {
    "encounters": 5,
    "allergies": 3,
    "medicalHistory": 4,
    "carePlans": 2,
    "immunizations": 4,
    "observations": 6
  }
}
```

### Encounters

```
GET /agent/patients/:id/encounters?from=&to=&take=&skip=
```

| Param  | Type     | Description |
|---     |---       |---|
| `from` | ISO date | Lower bound on `encounterDateTime`. |
| `to`   | ISO date | Upper bound on `encounterDateTime`. |
| `take` | integer  | Default 50, max 200. |
| `skip` | integer  | Offset. |

**Response `200`**

```json
{
  "patientId": "ckxabc123",
  "total": 5,
  "take": 50,
  "skip": 0,
  "encounters": [
    {
      "id": "ckxenc456",
      "encounterType": "OUTPATIENT",
      "encounterDateTime": "2026-05-01T09:00:00.000Z",
      "chiefComplaint": "Chest pain",
      "clinicalSummary": "Patient reports chest pain on exertion...",
      "attendingClinicianId": "clin-001",
      "disposition": "DISCHARGED"
    }
  ]
}
```

### Get encounter

```
GET /agent/encounters/:id
```

Returns the full encounter with related collections fully populated:

- `patient` (light demographic projection)
- `symptoms[]`
- `vitals[]`
- `diagnoses[]`
- `clinicalNotes[]`
- `medications[]`
- `labOrders[]` → each with `results[]`
- `imagingOrders[]` → each with `reports[]`
- `procedures[]`
- `outcomes[]`
- `observations[]`

This is the agent's main "give me everything about visit X" tool.

### Allergies

```
GET /agent/patients/:id/allergies
```

```json
{
  "patientId": "ckxabc123",
  "total": 3,
  "allergies": [
    { "allergen": "Penicillin", "reaction": "Urticaria", "severity": "HIGH", "status": "ACTIVE", "onsetDate": "..." }
  ]
}
```

### Medical history

```
GET /agent/patients/:id/medical-history
```

```json
{
  "patientId": "ckxabc123",
  "total": 4,
  "history": [
    { "conditionCode": "I10", "conditionName": "Hypertension", "chronicity": "CHRONIC", "familyHistory": true, "diagnosisDate": "..." }
  ]
}
```

### Care plans

```
GET /agent/patients/:id/care-plans
```

Each item includes its linked `diagnosis` (if any).

```json
{
  "patientId": "ckxabc123",
  "total": 2,
  "carePlans": [
    {
      "status": "ACTIVE",
      "goals": ["Reduce SBP < 130"],
      "interventions": ["Lifestyle counselling"],
      "monitoringPlan": "Monthly BP check",
      "reviewDate": "...",
      "diagnosis": { "id": "...", "diagnosisName": "Essential hypertension", "diagnosisType": "PRIMARY", "certainty": "CONFIRMED" }
    }
  ]
}
```

### Immunizations

```
GET /agent/patients/:id/immunizations
```

### Observations

```
GET /agent/patients/:id/observations?take=&skip=
```

### Medications

```
GET /agent/patients/:id/medications?from=&to=
```

Joins through encounters. `from`/`to` filter on `encounter.encounterDateTime`.

```json
{
  "patientId": "ckxabc123",
  "total": 12,
  "medications": [
    {
      "drugName": "Lisinopril",
      "dosage": "10mg",
      "route": "ORAL",
      "frequency": "OD",
      "indication": "Hypertension",
      "startDate": "...",
      "encounter": { "id": "ckxenc456", "encounterDateTime": "...", "encounterType": "OUTPATIENT" }
    }
  ]
}
```

### Lab results

```
GET /agent/patients/:id/lab-results?from=&to=
```

Joins through `LabOrder` → `Encounter`. Each row includes the parent `labOrder` (with its `encounter`).

### Vitals

```
GET /agent/patients/:id/vitals?from=&to=
```

`from`/`to` filter on `recordedAt`.

---

## Text-to-SQL

The SQL endpoint exists for queries that are too complex for the dedicated REST tools (e.g. cohort questions, aggregates, multi-table joins).

### Get schema

```
GET /agent/sql/schema
```

Returns the database's tables, columns, foreign-key relations, and enum types. Built from Prisma's DMMF so the names match the live schema.

**Response `200`** (truncated)

```json
{
  "dialect": "postgresql",
  "tables": [
    {
      "model": "Patient",
      "table": "patients_ehr",
      "columns": [
        { "name": "id", "prismaName": "id", "type": "String", "isList": false, "isRequired": true, "isId": true, "isUnique": false, "hasDefault": true },
        { "name": "medicalRecordNumber", "type": "String", "isRequired": true, "isUnique": true, "hasDefault": false },
        { "name": "sex", "type": "Sex (enum)", "isRequired": true, "hasDefault": false }
      ],
      "relations": [
        { "field": "encounters", "referencesModel": "Encounter", "fromFields": [], "toFields": [] }
      ]
    }
  ],
  "enums": [
    { "name": "Sex", "values": ["MALE", "FEMALE", "INTERSEX", "UNKNOWN"] }
  ],
  "notes": [
    "Use the table column for the actual SQL identifier (e.g. patients_ehr).",
    "Soft-deleted rows have deletedAt IS NOT NULL on most tables; filter accordingly.",
    "SQL is executed inside a READ ONLY transaction with statement_timeout=5000ms and an automatic LIMIT (max 500)."
  ]
}
```

### Run SQL query

```
POST /agent/sql/query
Content-Type: application/json
```

**Body**

| Field    | Type    | Required | Description |
|---       |---      |---        |---|
| `sql`    | string  | Yes      | A single `SELECT` or `WITH ... SELECT` statement. |
| `params` | array   | No       | Positional parameters (referenced as `$1, $2, ...` in the SQL). |
| `limit`  | integer | No       | Max rows to return. 1–500, default 500. Auto-injected if no `LIMIT` is present. |

**Example**

```bash
curl -sX POST http://localhost:3000/agent/sql/query \
  -H 'Content-Type: application/json' \
  -d '{
    "sql": "SELECT p.\"firstName\", p.\"lastName\", count(e.id) AS visits FROM patients_ehr p LEFT JOIN encounters e ON e.\"patientId\" = p.id WHERE p.\"deletedAt\" IS NULL GROUP BY p.id ORDER BY visits DESC",
    "limit": 10
  }'
```

**Parameterized example:**

```json
{
  "sql": "SELECT * FROM allergies WHERE \"patientId\" = $1 AND severity = $2",
  "params": ["ckxabc123", "HIGH"]
}
```

**Response `200`**

```json
{
  "sql": "SELECT ... ORDER BY visits DESC\nLIMIT 10",
  "limit": 10,
  "rowCount": 10,
  "truncated": true,
  "columns": ["firstName", "lastName", "visits"],
  "rows": [
    { "firstName": "Emeka", "lastName": "Okafor", "visits": "5" }
  ],
  "durationMs": 23
}
```

> **BigInt note.** Postgres `BIGINT` columns (and any aggregate counts) are returned as strings to keep JSON safe. Convert client-side if needed.

### SQL guardrails

The endpoint is **defense-in-depth**. Before executing, the request goes through `src/util/sqlGuard.js`, which:

1. Strips comments and string/identifier literals so keyword detection cannot be fooled by `'-- DROP'`.
2. Rejects multi-statement queries (more than one `;`).
3. Requires the leading keyword to be `SELECT` or `WITH`.
4. Rejects any of these keywords appearing as SQL tokens: `INSERT, UPDATE, DELETE, MERGE, UPSERT, DROP, ALTER, TRUNCATE, CREATE, RENAME, GRANT, REVOKE, CALL, DO, EXECUTE, COPY, VACUUM, ANALYZE, REINDEX, CLUSTER, LOCK, LISTEN, NOTIFY, UNLISTEN, COMMENT, RESET, SECURITY, ATTACH, DETACH, BEGIN, COMMIT, ROLLBACK, SAVEPOINT, PREPARE, DEALLOCATE, REFRESH, SET` (the only `SET` allowed is `SET LOCAL`, which the controller itself uses).
5. Auto-appends `LIMIT 500` (or your supplied `limit`) if no top-level `LIMIT` exists.

The query then runs inside:

```sql
BEGIN;
SET LOCAL statement_timeout = 5000;        -- 5s, configurable via AGENT_SQL_TIMEOUT_MS
SET LOCAL transaction_read_only = on;
-- your query
COMMIT;
```

Failures return `400` with the guard's reason, e.g. `{ "error": "Forbidden keyword: DELETE" }`, or `{ "error": "Multiple statements are not allowed" }`.

---

## Sample tool definitions

Drop-in JSON for the most common agent SDKs. The schemas mirror the catalog at `/agent/tools` but in each provider's expected shape.

### OpenAI / function-calling

```json
[
  {
    "type": "function",
    "function": {
      "name": "search_documents",
      "description": "Semantic vector search across uploaded clinical documents.",
      "parameters": {
        "type": "object",
        "properties": {
          "query":     { "type": "string", "description": "Natural-language query." },
          "limit":     { "type": "integer", "minimum": 1, "maximum": 50, "default": 5 },
          "patientId": { "type": "string" },
          "fileId":    { "type": "string" }
        },
        "required": ["query"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "run_sql_query",
      "description": "Execute a read-only SELECT against the EHR Postgres database.",
      "parameters": {
        "type": "object",
        "properties": {
          "sql":    { "type": "string", "description": "A single SELECT or WITH ... SELECT." },
          "params": { "type": "array",  "items": {} },
          "limit":  { "type": "integer", "minimum": 1, "maximum": 500, "default": 500 }
        },
        "required": ["sql"]
      }
    }
  }
]
```

### Anthropic / tool-use

```json
[
  {
    "name": "search_doctor_notes",
    "description": "Semantic vector search across saved doctor notes.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query":       { "type": "string" },
        "limit":       { "type": "integer", "minimum": 1, "maximum": 50, "default": 5 },
        "patientId":   { "type": "string" },
        "encounterId": { "type": "string" }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_encounter",
    "description": "Get a full encounter with symptoms, vitals, diagnoses, notes, meds, labs, imaging, procedures, outcomes, and observations.",
    "input_schema": {
      "type": "object",
      "properties": { "id": { "type": "string", "description": "Encounter ID." } },
      "required": ["id"]
    }
  }
]
```

### MCP-style

If you wrap this server with an MCP gateway, each entry from `GET /agent/tools` becomes a tool. Suggested `inputSchema` mapping:

| Catalog field | MCP field |
|---|---|
| `name`        | `name` |
| `description` | `description` |
| `input.*`     | flatten into `inputSchema.properties.*` (with `required` derived from `required: true`) |

The HTTP call itself is performed by the MCP server — substitute path parameters into `path` and JSON-encode the rest into the body (for POST) or query string (for GET).

---

## Common errors

| Status | Body | Meaning |
|---|---|---|
| `400` | `{ "error": "query is required" }` | Missing or invalid request field. |
| `400` | `{ "error": "Forbidden keyword: DELETE" }` | SQL guard rejected the statement. |
| `400` | `{ "error": "Multiple statements are not allowed" }` | More than one `;`-delimited statement. |
| `400` | `{ "error": "Only SELECT or WITH ... SELECT statements are allowed (got UPDATE)" }` | Wrong leading keyword. |
| `404` | `{ "error": "Patient not found" }` | Resource missing or soft-deleted. |
| `500` | `{ "error": "Failed to ...", "code": "P2025" }` | Internal failure (Prisma error code where applicable). |
| `503` | `{ "status": "DEGRADED", "checks": { ... } }` | Health check — DB or Qdrant unavailable. |

---

## Production hardening

The current build trades some robustness for speed of integration. Before exposing this to untrusted callers:

- **Add auth.** Require `Authorization: Bearer ...` middleware on the `/agent` router with a per-agent API key.
- **Add a read-only DB role.** Create a Postgres role with `GRANT SELECT` on the EHR tables only and point a dedicated `PrismaClient` (or `pg.Pool`) at it for `/agent/sql/query`. The current SQL guard plus `transaction_read_only` is defense-in-depth, but a separate role is the strongest defense.
- **Rate-limit.** A single misbehaving agent can flood the embedding API and Qdrant. Use `express-rate-limit` per IP/key on `/agent/rag/*` and `/agent/sql/query`.
- **Audit log.** Persist `{timestamp, agentKey, route, query/sql, latency, rowCount}` to a log so you can review what the agent saw.
- **PHI redaction.** If the agent should not see direct identifiers, add a response middleware that masks `firstName`, `lastName`, `medicalRecordNumber`, etc.
- **Caching.** Embedding + Qdrant calls are the slowest hop. An LRU cache on `(query, collection, filterHash)` significantly speeds up repeated searches.

---

_Last updated: 2026-05-07. See [API.md](API.md) for the broader file/ingest/RAG API and [README.md](README.md) for setup._
