# Quick Start Guide

## Prerequisites
1. **Qdrant** - Vector database (cloud or local)
2. **Google API Key** - For Gemini embeddings
3. **Node.js** - v16 or higher

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `sample.env` to `.env` and update:

```env
# Server
PORT=3000

# Qdrant configuration
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION=rag_chunks
RAG_VECTOR_SIZE=768
RAG_VECTOR_DISTANCE=Cosine

# Google Gemini embeddings
GOOGLE_API_KEY=your_google_api_key
RAG_EMBEDDING_MODEL=gemini-embedding-001

# RAG Processing Configuration
RAG_CHUNK_SIZE=800
RAG_CHUNK_OVERLAP=100
MAX_FILE_SIZE=10485760
```

### 3. Start the Server
```bash
npm start
```

Server will run on `http://localhost:3000`

## Using the Application

### Upload a Document

1. **Open** `http://localhost:3000` in your browser
2. **Click** "Upload Document" button
3. **Select or drag** a file (PDF, DOC, DOCX, TXT, CSV)
4. **Configure** (optional):
   - Chunk Size: 100-2000 characters (default: 800)
   - Chunk Overlap: 0-500 characters (default: 100)
5. **Click** "Process Document"
6. **Watch** real-time progress:
   - ✓ Uploading file
   - ✓ Extracting text
   - ✓ Creating chunks
   - ✓ Generating embeddings
   - ✓ Storing vectors

### View Documents

All processed documents appear in the table with:
- Name
- Type (PDF, DOC, TXT, CSV)
- Size
- Vector count
- Upload date/time
- Actions (Download, Delete)

### Download a Document

Click the download icon (↓) next to any document

### Delete a Document

Click the delete icon (🗑️) next to any document
- Confirms before deletion
- Removes file, metadata, and all vectors

## Troubleshooting

### "Port already in use"
Kill the existing process:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill
```

### "Upload failed"
Check:
- File size < 10MB
- File type is supported
- Qdrant is running
- Google API key is valid

### "Text extraction failed"
- PDF might be scanned (no text layer)
- File might be corrupted
- Try a different file format

### "Embedding failed"
- Check Google API key
- Check API quota
- Check network connection

### "Vector storage failed"
- Check Qdrant connection
- Check Qdrant API key
- Check collection name

## API Endpoints

### Upload File
```bash
POST /files/upload
Content-Type: multipart/form-data

FormData:
  file: <file>
  chunkSize: 800
  chunkOverlap: 100
```

### List Files
```bash
GET /files
```

### Get File
```bash
GET /files/:id
```

### Download File
```bash
GET /files/:id/download
```

### Delete File
```bash
DELETE /files/:id
```

### Search (RAG)
```bash
POST /rag/search
Content-Type: application/json

{
  "query": "your search query",
  "limit": 5,
  "filter": {} // optional
}
```

### Check Status
```bash
GET /rag/status/:fileId
```

## Features

### Transactional Processing
If any step fails, the entire upload is rolled back:
- File is deleted
- Metadata is not saved
- Vectors are removed
- User gets clear error message

### Error Messages
The UI provides helpful error messages:
- "File size exceeds 10MB limit"
- "Invalid file type"
- "No text could be extracted"
- "Embedding generation failed"
- Network timeouts

### Progress Tracking
Real-time progress with:
- Visual progress bar (0-100%)
- Current step highlighted
- Step-by-step descriptions
- Success statistics

### Configuration
Per-upload configuration:
- **Chunk Size**: Larger = fewer chunks, less overlap
- **Chunk Overlap**: Larger = more context, more redundancy
- Balance based on your use case

## Best Practices

### Chunk Size
- **Small (100-400)**: Short Q&A, precise retrieval
- **Medium (400-1000)**: Balanced approach (recommended)
- **Large (1000-2000)**: Long context, documents

### Chunk Overlap
- **None (0)**: No redundancy, faster processing
- **Small (50-150)**: Minimal overlap (recommended)
- **Large (200-500)**: High overlap, better context

### File Types
- **PDF**: Best for scanned documents with text layer
- **DOCX**: Best for Word documents
- **TXT**: Fastest processing, no formatting
- **CSV**: For structured data

## Next Steps

1. **Upload test documents** to verify setup
2. **Try different chunk sizes** to optimize for your use case
3. **Use RAG search** to query your documents
4. **Integrate** with your application via API

## Support

For issues or questions:
1. Check error messages in the UI
2. Check server logs
3. Verify configuration
4. Test with sample files

