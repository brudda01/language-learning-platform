import { Router } from 'express';
import { SessionController } from '../controllers/sessionController.js';

const router = Router();
const sessionController = new SessionController();

// Session management routes
router.post('/start', sessionController.startSession);
router.get('/:session_id', sessionController.getSession);
router.post('/:session_id/message', sessionController.addMessage);
router.get('/user/:username', sessionController.getUserSessions);
router.delete('/:session_id', sessionController.deleteSession);

export { router as sessionRoutes }; 