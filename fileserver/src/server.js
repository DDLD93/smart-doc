require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { initializeJobEvents, joinJobRoom } = require('./realtime/jobEvents');
const { startIngestWorker } = require('./jobs/ingestWorker');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});

initializeJobEvents(io);
io.on('connection', (socket) => {
    joinJobRoom(socket);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve public UI
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes
const fileRoutes = require('./route/file.route')();
app.use('/files', fileRoutes);
const ragRoutes = require('./route/rag.route');
app.use('/rag', ragRoutes);
const jobsRoutes = require('./route/jobs.route');
app.use('/jobs', jobsRoutes);
const patientRoutes = require('./route/patient.route');
app.use('/api/patients', patientRoutes);
const doctorNoteRoutes = require('./route/doctorNote.route');
app.use('/api/patients/:id/notes', doctorNoteRoutes);
const searchRoutes = require('./route/search.route');
app.use('/api/search', searchRoutes);
const agentRoutes = require('./route/agent.route');
app.use('/agent', agentRoutes);

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
server.listen(PORT, async () => {
    console.log(`File server running on http://localhost:${PORT}`);
    try {
        await startIngestWorker();
    } catch (error) {
        console.error('[Server] failed to start ingest worker:', error.message);
    }
});

