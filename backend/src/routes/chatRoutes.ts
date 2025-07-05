import { Router } from 'express';
import { ChatController } from '../controllers/chatController.js';

const router = Router();
const chatController = new ChatController();

// Chat AI routes
router.post('/stream', chatController.streamResponse);
router.post('/generate', chatController.generateResponse);
router.post('/exercise', chatController.generateExercise);

export { router as chatRoutes }; 