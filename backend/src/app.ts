import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { testDatabaseConnection } from './utils/database.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRoutes } from './routes/index.js';
import { mainApiRoutes } from './routes/apiRoutes.js';

const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Static file serving for audio files
app.use('/audio', express.static('uploads/audio'));

// Main API routes
app.use('/', mainApiRoutes);

// New API routes (for future development)
app.use('/api', apiRoutes);

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  const dbConnected = await testDatabaseConnection();
  
  res.json({
    success: true,
    message: 'Language Learning Platform Backend is running',
    timestamp: new Date().toISOString(),
          version: '1.0.0',
    tech_stack: {
      runtime: 'Node.js',
      framework: 'Express',
      database: 'PostgreSQL with Prisma',
      ai_service: 'Google Gemini',
      tts_service: 'Google Text-to-Speech (gTTS)'
    },
    services: {
      database: dbConnected ? '✅ Connected' : '❌ Disconnected',
      ai_service: config.geminiApiKey ? '✅ API Key Set' : '⚠️  API Key Missing',
      tts_service: '✅ Ready'
    },
    endpoints: {
      main: {
        session_start: 'POST /session/start',
        session_continue: 'POST /session/continue',
        speech: 'GET /speech/:word'
      },
      new_api: {
        users: '/api/users',
        sessions: '/api/sessions',
        chat: '/api/chat',
        speech: '/api/speech'
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    available_endpoints: [
      'GET /health',
      'POST /session/start',
      'POST /session/continue',  
      'GET /speech/:word',
      'GET /api/health',
      'POST /api/users/start-session'
    ]
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`
🚀 Language Learning Platform Backend is running!

📊 Server Details:
   • Port: ${PORT}
   • Env: ${config.nodeEnv}
   • Database: ${config.databaseUrl ? '✅ Connected' : '❌ Not configured'}
   • AI Service: ${config.geminiApiKey ? '✅ Gemini API Ready' : '⚠️  Gemini API Key Missing'}

🔄 API Compatibility:
   • Main Routes: POST /session/start, POST /session/continue, GET /speech/:word
   • New Routes: /api/* (for future development)

🌐 Frontend Compatible Endpoints:
   • Session Start: http://localhost:${PORT}/session/start
   • Session Continue: http://localhost:${PORT}/session/continue
   • Speech Audio: http://localhost:${PORT}/speech/{word}

✨ Ready for frontend connection!
  `);
});

export default app; 