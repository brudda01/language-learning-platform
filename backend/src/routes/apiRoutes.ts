import { Router, Request, Response } from 'express';
import { UserService, SessionService } from '../utils/database.js';
import { GeminiService } from '../services/geminiService.js';
import { TextToSpeechService } from '../services/textToSpeechService.js';
import { GreetingService } from '../utils/greetingService.js';
import { createStreamingResponse } from '../utils/streamingResponse.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { ChatMessage } from '../types/index.js';
import path from 'path';

const router = Router();

// Initialize services
const geminiService = new GeminiService();
const ttsService = new TextToSpeechService();
const greetingService = new GreetingService();

/**
 * Core API Routes - Language Learning Platform Backend
 * Main routes for session management and learning functionality
 */

// POST /session/start - Create user and session, return session_id and greeting
router.post('/session/start', asyncHandler(async (req: Request, res: Response) => {
  const { user_name, source_language, target_language } = req.body;

  if (!user_name || !source_language || !target_language) {
    throw createError.badRequest('Missing required fields: user_name, source_language, target_language');
  }

  try {
    // Create or get user
    let user = await UserService.findByUsername(user_name);
    if (!user) {
      user = await UserService.create({
        user_name,
        source_language,
        target_language,
        word_initiated: [],
        word_progress: {}
      });
    }

    // Generate greeting
    const greeting = await greetingService.generatePersonalizedGreeting({
      userName: user.user_name,
      sourceLanguage: user.source_language,
      targetLanguage: user.target_language,
      wordsInitiated: user.word_initiated as string[],
      wordProgress: user.word_progress as Record<string, string>
    });

    // Create session with greeting
    const session = await SessionService.create({
      user_id: user.id,
      message_history: [
        { role: 'assistant', content: greeting }
      ] as ChatMessage[]
    });

    // Return exact format frontend expects
    res.json({
      session_id: session.id,
      greeting: greeting
    });

  } catch (error) {
    console.error('Error in /session/start:', error);
    throw createError.internal('Failed to start session');
  }
}));

// POST /session/continue - Handle streaming chat continuation
router.post('/session/continue', asyncHandler(async (req: Request, res: Response) => {
  const { session_id, user_message } = req.body;

  if (!session_id || !user_message) {
    throw createError.badRequest('Missing required fields: session_id, user_message');
  }

  try {
    // Get session and user
    const session = await SessionService.findById(session_id);
    if (!session) {
      throw createError.notFound('Session not found');
    }

    const user = await UserService.findById(session.user_id);
    if (!user) {
      throw createError.internal('Session user not found');
    }

    // Add user message to history
    const currentHistory = session.message_history as ChatMessage[];
    const userMsg: ChatMessage = { role: 'user', content: user_message };
    const updatedHistory = [...currentHistory, userMsg];

    // Set up streaming response headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Generate AI response
    const aiContext = {
      currentWord: null,
      currentCategory: null,
      userLanguages: {
        source: user.source_language,
        target: user.target_language
      }
    };

    const responseStream = await geminiService.generateTutoringResponse(
      updatedHistory,
      aiContext
    );

    let fullResponse = '';
    let sentResponse = '';

    // Start streaming JSON object
    res.write('{"response": "');

    try {
      for await (const chunk of responseStream) {
        fullResponse += chunk;
        
        // Send new characters that haven't been sent yet
        const newContent = fullResponse.substring(sentResponse.length);
        
        // Escape JSON special characters
        const escapedContent = newContent
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        
        res.write(escapedContent);
        sentResponse = fullResponse;
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Complete the JSON object
      res.write('", "currentCategory": null, "currentWord": null, "currentWordProgress": null, "exercises": null}');
      res.end();

      // Save complete conversation to database
      try {
        const aiResponse: ChatMessage = { role: 'assistant', content: fullResponse };
        const finalHistory = [...updatedHistory, aiResponse];
        await SessionService.updateMessages(session_id, finalHistory);
      } catch (error) {
        console.error('Error saving message history:', error);
      }

    } catch (streamError) {
      console.error('Error during streaming:', streamError);
      // Try to complete the JSON object properly
      res.write('", "currentCategory": null, "currentWord": null, "currentWordProgress": null, "exercises": null}');
      res.end();
    }

  } catch (error) {
    console.error('Error in /session/continue:', error);
    if (!res.headersSent) {
      throw createError.internal('Failed to continue session');
    }
  }
}));

// GET /speech/:word - Return audio file directly
router.get('/speech/:word', asyncHandler(async (req: Request, res: Response) => {
  const word = req.params.word;
  const language = (req.query.language as string) || 'en-US';

  if (!word) {
    throw createError.badRequest('Word parameter is required');
  }

  try {
    // Generate audio for the word
    const audioResult = await ttsService.generateVocabularyAudio(word, language, false);
    
    // Get the file path
    const audioPath = audioResult.normal.audioPath;
    
    // Send the audio file directly
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${word}.mp3"`);
    
    // Send the file
    res.sendFile(path.resolve(audioPath));

  } catch (error) {
    console.error('Error in /speech/:word:', error);
    throw createError.internal('Failed to generate speech');
  }
}));

// Health check (same as original)
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Language Learning Platform Backend is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

export { router as mainApiRoutes }; 