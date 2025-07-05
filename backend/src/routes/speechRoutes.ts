import { Router } from 'express';
import { SpeechController } from '../controllers/speechController.js';

const router = Router();
const speechController = new SpeechController();

// Speech/TTS routes
router.post('/generate', speechController.generateSpeech);
router.post('/vocabulary', speechController.generateVocabularyAudio);
router.post('/sentences', speechController.generateSentenceAudio);
router.post('/bulk-vocabulary', speechController.bulkGenerateVocabulary);
router.get('/languages', speechController.getSupportedLanguages);
router.delete('/cleanup', speechController.cleanupAudioFiles);

export { router as speechRoutes }; 