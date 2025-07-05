import { Router } from 'express';
import { UserController } from '../controllers/userController.js';

const router = Router();
const userController = new UserController();

// User management routes
router.post('/start-session', userController.startSession);
router.get('/:username', userController.getUser);
router.put('/:username/progress', userController.updateProgress);
router.get('/:username/stats', userController.getUserStats);

export { router as userRoutes }; 