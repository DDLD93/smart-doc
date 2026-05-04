# AI Document Processor

Document processing backend with S3-compatible object storage, Prisma/Postgres metadata, asynchronous ingestion over NATS JetStream, Qdrant vector storage, and Socket.IO job updates for the UI.

## Features

- Upload files to S3-compatible storage (R2/MinIO/Spaces compatible)
- Persist file + ingestion job state in Postgres via Prisma
- Queue ingestion jobs in JetStream with retry/backoff support
- Real-time job updates in the browser via Socket.IO
- AI extraction/chunking/embeddings with Google Gemini + Qdrant
- Compensating rollback: if DB write fails after S3 upload, object is deleted

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables. The fileserver and agent share a single
   env file at the repository root. Copy `../sample.env` to `../.env` and fill in:
   - `POSTGRES_CONNECTION_STRING`
   - `S3_*`
   - `NATS_*`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `QDRANT_*`

   When running via `docker compose up` from the repo root, the root `.env` is
   loaded automatically for both services.

3. Generate Prisma client:
```bash
npm run prisma:generate
```

4. Apply migrations:
```bash
npm run prisma:deploy
```

5. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

## API Endpoints

### Health Check
- **GET** `/health` - Check server status

### File Operations

#### Upload File (queue ingestion)
- **POST** `/files/upload`
- Content-Type: `multipart/form-data`
- Body: `file`, optional `chunkSize`, `chunkOverlap`
- Response: `202` with `{ file, job }`

#### View All Files
- **GET** `/files`
- Response: List of uploaded files with metadata (excludes soft-deleted legacy rows with `status=DELETED` if any remain)

#### View Single File
- **GET** `/files/:id`
- Response: Detailed information about a specific file

#### Download File
- **GET** `/files/:id/download`
- Response: pre-signed S3 URL

#### Delete File
- **DELETE** `/files/:id`
- Response: permanently deletes the file from S3, Qdrant, and the database (including ingest jobs and attempts). External cleanup steps are best-effort; the DB row is always removed when the request succeeds.

#### File Jobs
- **GET** `/files/:id/jobs`
- Response: ingestion jobs for one file

#### Job Status
- **GET** `/jobs/:jobId`
- Response: current status + attempts + errors

### RAG Operations

- **POST** `/rag/search` semantic search in Qdrant
- **GET** `/rag/status/:fileId` vector count by file

## Supported File Types

- Images: JPEG, PNG, GIF, WebP
- Documents: PDF, DOC, DOCX, XLS, XLSX
- Text: TXT, CSV, JSON

## Storage

- Files: S3-compatible object storage
- Metadata and jobs: Postgres via Prisma
- Vectors: Qdrant

## Example Usage

### Upload a file:
```bash
curl -X POST -F "file=@example.pdf" http://localhost:3000/files/upload
```

### Get all files:
```bash
curl http://localhost:3000/files
```

### Get specific file:
```bash
curl http://localhost:3000/files/1234567890
```

### Download file:
```bash
curl http://localhost:3000/files/1234567890/download
```

### Delete file:
```bash
curl -X DELETE http://localhost:3000/files/1234567890
```

## Error Handling

The API includes comprehensive error handling for:
- File not found (404)
- Invalid file types
- File size limits exceeded
- Internal server errors

## Real-time UI Updates

The web UI subscribes to Socket.IO room `job:{jobId}` and receives:
- `job.queued`
- `job.progress`
- `job.retry`
- `job.completed`
- `job.failed`
