require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// Database setup
const db = require('./connection/jsondb.connection');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_PATH = path.join(__dirname, 'uploads');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_PATH)) {
    fs.mkdirSync(UPLOAD_PATH, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(UPLOAD_PATH));

// Serve public UI
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes
const fileRoutes = require('./route/file.route')(UPLOAD_PATH);
app.use('/files', fileRoutes);
const ragRoutes = require('./route/rag.route');
app.use('/rag', ragRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'File server is running' });
});



// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
    }

    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`File server running on http://localhost:${PORT}`);
    console.log(`Upload directory: ${UPLOAD_PATH}`);
});

