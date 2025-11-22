# AI Document Processor

A modern document processing system with AI-powered embeddings, built with Express.js, Qdrant, and Google Gemini. Features a clean shadcn/ui-inspired interface with real-time progress tracking.

## Features

- 🎨 **Modern UI** - Clean, shadcn/ui-inspired interface with responsive design
- 📤 **File Upload** - Drag & drop or click to upload (PDF, DOC, DOCX, TXT, CSV)
- 🔄 **Real-time Progress** - Step-by-step progress tracking with detailed feedback
- 🤖 **AI Processing** - Automatic text extraction, chunking, and embedding generation
- 🗄️ **Vector Storage** - Store embeddings in Qdrant for semantic search
- ⚙️ **Configurable** - Adjust chunk size and overlap per upload
- 🔒 **Transactional** - Automatic rollback on failure
- 📊 **Processing Stats** - View detailed statistics after processing
- 🎯 **Error Handling** - Clear, actionable error messages

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

## API Endpoints

### Health Check
- **GET** `/health` - Check server status

### File Operations

#### Upload File
- **POST** `/upload`
- Content-Type: `multipart/form-data`
- Body: `file` (the file to upload)
- Response: File metadata with ID and URL

#### View All Files
- **GET** `/files`
- Response: List of all uploaded files with metadata

#### View Single File
- **GET** `/files/:id`
- Response: Detailed information about a specific file

#### Download File
- **GET** `/files/:id/download`
- Response: File download

#### Delete File
- **DELETE** `/files/:id`
- Response: Confirmation of file deletion

## Supported File Types

- Images: JPEG, PNG, GIF, WebP
- Documents: PDF, DOC, DOCX, XLS, XLSX
- Text: TXT, CSV, JSON

## File Storage

- Files are stored in `src/uploads/` directory
- Metadata is stored in `fileDB.json` (created automatically)
- Files are accessible via `/uploads/filename` URL

## Example Usage

### Upload a file using curl:
```bash
curl -X POST -F "file=@example.pdf" http://localhost:3000/upload
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
curl -O http://localhost:3000/files/1234567890/download
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

## Security Notes

- File type validation is implemented
- File size is limited to 10MB
- Files are stored with unique names to prevent conflicts
- CORS is enabled for cross-origin requests
