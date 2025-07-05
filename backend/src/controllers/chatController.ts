import { Request, Response } from 'express';
import { z } from 'zod';
import { SessionService, UserService } from '../utils/database.js';
import { GeminiService } from '../services/geminiService.js';
import { createStreamingResponse } from '../utils/streamingResponse.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { ChatMessage } from '../types/index.js';

// Request validation schemas
const StreamChatSchema = z.object({
  session_id: z.string().uuid('Invalid session ID format'),
  user_message: z.string().min(1, 'Message is required'),
  context: z.object({
    currentWord: z.string().optional().nullable(),
    currentCategory: z.string().optional().nullable(),
    userLanguages: z.object({
      source: z.string(),
      target: z.string()
    }).optional()
  }).optional()
});

const GenerateResponseSchema = z.object({
  user_name: z.string().min(1, 'Username is required'),
  message: z.string().min(1, 'Message is required'),
  context: z.object({
    currentWord: z.string().optional().nullable(),
    currentCategory: z.string().optional().nullable()
  }).optional()
});

export class ChatController {
  private geminiService: GeminiService;

  constructor() {
    this.geminiService = new GeminiService();
  }

  /**
   * Stream AI response for a session
   * POST /api/chat/stream
   */
  streamResponse = asyncHandler(async (req: Request, res: Response) => {
    const validation = StreamChatSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { session_id, user_message, context } = validation.data;

    try {
      // Verify session exists
      const session = await SessionService.findById(session_id);
      if (!session) {
        throw createError.notFound(`Session '${session_id}' not found`);
      }

      // Get user details
      const user = await UserService.findById(session.user_id);
      if (!user) {
        throw createError.internal('Session user not found');
      }

      // Get current message history and add user message
      const currentHistory = session.message_history as ChatMessage[];
      const userMsg: ChatMessage = {
        role: 'user',
        content: user_message
      };

      const updatedHistory = [...currentHistory, userMsg];

      // Create streaming response handler
      const streamHandler = createStreamingResponse(res);

      // Prepare context for AI
      const aiContext = {
        currentWord: context?.currentWord || null,
        currentCategory: context?.currentCategory || null,
        userLanguages: context?.userLanguages || {
          source: user.source_language,
          target: user.target_language
        }
      };

      console.log(`🤖 Starting AI response stream for session ${session_id}`);

      // Generate streaming response from Gemini
      const responseStream = await this.geminiService.generateTutoringResponse(
        updatedHistory,
        aiContext
      );

      // Collect the full response for saving to database
      let fullResponse = '';

      // Stream the response to client
      await streamHandler.streamAsyncIterator(responseStream, {
        onChunk: (chunk) => {
          fullResponse += chunk;
        },
        onComplete: async () => {
          try {
            // Add AI response to message history
            const aiResponse: ChatMessage = {
              role: 'assistant',
              content: fullResponse
            };

            const finalHistory = [...updatedHistory, aiResponse];

            // Update session with complete conversation
            await SessionService.updateMessages(session_id, finalHistory);

            console.log(`✅ Completed AI response for session ${session_id}`);
          } catch (error) {
            console.error('Error saving AI response to session:', error);
          }
        },
        onError: (error) => {
          console.error('Error in AI response stream:', error);
        }
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in streamResponse:', error);
      throw createError.internal('Failed to generate AI response');
    }
  });

  /**
   * Generate non-streaming AI response
   * POST /api/chat/generate
   */
  generateResponse = asyncHandler(async (req: Request, res: Response) => {
    const validation = GenerateResponseSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { user_name, message, context } = validation.data;

    try {
      // Verify user exists
      const user = await UserService.findByUsername(user_name);
      if (!user) {
        throw createError.notFound(`User '${user_name}' not found`);
      }

      // Prepare context for AI
      const aiContext = {
        currentWord: context?.currentWord || null,
        currentCategory: context?.currentCategory || null,
        userLanguages: {
          source: user.source_language,
          target: user.target_language
        }
      };

      // Create simple message history for this request
      const messageHistory: ChatMessage[] = [
        {
          role: 'user',
          content: message
        }
      ];

      console.log(`🤖 Generating AI response for user ${user_name}`);

      // Generate streaming response
      const responseStream = await this.geminiService.generateTutoringResponse(
        messageHistory,
        aiContext
      );

      // Collect full response
      let fullResponse = '';
      for await (const chunk of responseStream) {
        fullResponse += chunk;
      }

      const response = {
        success: true,
        data: {
          user_name,
          user_message: message,
          ai_response: fullResponse,
          context: context || {
            currentWord: null,
            currentCategory: null
          },
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ Generated AI response for user ${user_name}`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in generateResponse:', error);
      throw createError.internal('Failed to generate AI response');
    }
  });

  /**
   * Generate vocabulary exercise
   * POST /api/chat/exercise
   */
  generateExercise = asyncHandler(async (req: Request, res: Response) => {
    const exerciseSchema = z.object({
      user_name: z.string().min(1, 'Username is required'),
      words: z.array(z.string()).min(1, 'At least one word is required'),
      difficulty: z.enum(['basic', 'intermediate', 'advanced']).optional().default('basic'),
      exercise_type: z.enum(['unscramble', 'fill_blank', 'match']).optional().default('unscramble')
    });

    const validation = exerciseSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { user_name, words, difficulty, exercise_type } = validation.data;

    try {
      // Verify user exists
      const user = await UserService.findByUsername(user_name);
      if (!user) {
        throw createError.notFound(`User '${user_name}' not found`);
      }

      console.log(`🎯 Generating ${exercise_type} exercise for user ${user_name}`);

      // Generate exercise using AI
      const exercisePrompt = this.createExercisePrompt(
        words,
        difficulty,
        exercise_type,
        user.source_language,
        user.target_language
      );

      const exerciseResponse = await this.geminiService.generateResponse(exercisePrompt);

      // Parse the response (in production, you'd want more robust parsing)
      let exerciseData;
      try {
        exerciseData = JSON.parse(exerciseResponse);
      } catch (parseError) {
        // Fallback: create simple exercise data
        exerciseData = this.createFallbackExercise(words, difficulty, exercise_type);
      }

      const response = {
        success: true,
        data: {
          user_name,
          exercise_type,
          difficulty,
          words,
          exercise: exerciseData,
          instructions: this.getExerciseInstructions(exercise_type, user.source_language),
          timestamp: new Date().toISOString()
        }
      };

      console.log(`✅ Generated ${exercise_type} exercise for user ${user_name}`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in generateExercise:', error);
      throw createError.internal('Failed to generate exercise');
    }
  });

  /**
   * Private helper methods
   */

  private createExercisePrompt(
    words: string[],
    difficulty: string,
    exerciseType: string,
    sourceLanguage: string,
    targetLanguage: string
  ): string {
    const wordList = words.join(', ');

    return `Create a ${difficulty} level ${exerciseType} exercise using these ${targetLanguage} words: ${wordList}

For the user who speaks ${sourceLanguage}, create:

1. If unscramble: Create sentences using these words, then scramble the word order
2. If fill_blank: Create sentences with blanks where these words should go
3. If match: Create definitions or translations for matching

Return JSON format:
{
  "exercise_type": "${exerciseType}",
  "difficulty": "${difficulty}",
  "items": [
    {
      "id": 1,
      "original": "original sentence or definition",
      "scrambled": "scrambled version (for unscramble)",
      "blanked": "sentence with _____ (for fill_blank)",
      "answer": "correct answer",
      "word_focus": "target word from list"
    }
  ]
}

Create 3-5 exercise items. Keep sentences practical and relevant to daily life.`;
  }

  private createFallbackExercise(words: string[], difficulty: string, exerciseType: string) {
    // Simple fallback exercise generation
    const items = words.map((word, index) => ({
      id: index + 1,
      word_focus: word,
      original: `Practice sentence with ${word}`,
      scrambled: exerciseType === 'unscramble' ? `with ${word} sentence Practice` : undefined,
      blanked: exerciseType === 'fill_blank' ? `Practice sentence with _____` : undefined,
      answer: word
    }));

    return {
      exercise_type: exerciseType,
      difficulty,
      items
    };
  }

  private getExerciseInstructions(exerciseType: string, language: string): string {
    const instructions = {
      unscramble: {
        en: 'Unscramble the words to form correct sentences.',
        es: 'Reorganiza las palabras para formar oraciones correctas.',
        fr: 'Réorganisez les mots pour former des phrases correctes.'
      },
      fill_blank: {
        en: 'Fill in the blanks with the correct words.',
        es: 'Completa los espacios en blanco con las palabras correctas.',
        fr: 'Remplissez les blancs avec les mots corrects.'
      },
      match: {
        en: 'Match the words with their correct definitions.',
        es: 'Relaciona las palabras con sus definiciones correctas.',
        fr: 'Associez les mots à leurs définitions correctes.'
      }
    };

    const langCode = language.toLowerCase().startsWith('es') ? 'es' :
                     language.toLowerCase().startsWith('fr') ? 'fr' : 'en';

    return instructions[exerciseType as keyof typeof instructions]?.[langCode] || 
           instructions[exerciseType as keyof typeof instructions]?.en || 
           'Complete the exercise.';
  }
} 