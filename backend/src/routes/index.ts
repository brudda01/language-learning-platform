import { Router } from 'express';
import { userRoutes } from './userRoutes.js';
import { sessionRoutes } from './sessionRoutes.js';
import { chatRoutes } from './chatRoutes.js';
import { speechRoutes } from './speechRoutes.js';

const router = Router();

// Mount all route modules
router.use('/users', userRoutes);
router.use('/sessions', sessionRoutes);
router.use('/chat', chatRoutes);
router.use('/speech', speechRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Language Learning Platform API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    endpoints: {
      users: '/api/users',
      sessions: '/api/sessions',
      chat: '/api/chat',
      speech: '/api/speech'
    }
  });
});

export { router as apiRoutes }; 