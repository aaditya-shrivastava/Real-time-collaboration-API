require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initSchema } = require('../config/db');
const { authenticateSocket } = require('./middleware/auth');
const socketHandler = require('../socket/socketHandler');
const errorHandler = require('./middleware/errorHandler');

const userRoutes = require('./routes/users');
const documentRoutes = require('./routes/documents');
const versionRoutes = require('./routes/versions');

const app = express();
const httpServer = http.createServer(app);

// ── Socket.IO ──
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use(authenticateSocket);
socketHandler(io);

// ── Express Middleware ──
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*', credentials: true }));
app.use(express.json());

// Serve frontend static files — works both locally and in Docker
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// ── API Routes ──
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents/:docId/versions', versionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages/index.html'));
});

// ── Error Handler ──
app.use(errorHandler);

// ── Boot ──
const PORT = process.env.PORT || 4000;

const start = async () => {
  try {
    await initSchema();
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket ready on ws://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
