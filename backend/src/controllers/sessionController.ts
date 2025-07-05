import { Request, Response } from 'express';
import { z } from 'zod';
import { SessionService, UserService } from '../utils/database.js';
import { GreetingService } from '../utils/greetingService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { ServiceResponse, CreateSessionData, ChatMessage } from '../types/index.js';

// Request validation schemas
const CreateSessionSchema = z.object({
  user_name: z.string().min(1, 'Username is required'),
  initial_message: z.string().optional(),
  context: z.object({
    currentWord: z.string().optional().nullable(),
    currentCategory: z.string().optional().nullable()
  }).optional()
});

const ContinueSessionSchema = z.object({
  session_id: z.string().uuid('Invalid session ID format'),
  user_message: z.string().min(1, 'Message is required'),
  context: z.object({
    currentWord: z.string().optional().nullable(),
    currentCategory: z.string().optional().nullable()
  }).optional()
});

const GetSessionSchema = z.object({
  session_id: z.string().uuid('Invalid session ID format')
});

export class SessionController {
  private greetingService: GreetingService;

  constructor() {
    this.greetingService = new GreetingService();
  }

  /**
   * Create new learning session
   * POST /api/sessions/start
   */
  startSession = asyncHandler(async (req: Request, res: Response) => {
    const validation = CreateSessionSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { user_name, initial_message, context } = validation.data;

    try {
      // Verify user exists
      const user = await UserService.findByUsername(user_name);
      if (!user) {
        throw createError.notFound(`User '${user_name}' not found. Please create user first.`);
      }

      // Generate session greeting
      let greeting: string;
      if (context?.currentWord && context?.currentCategory) {
        greeting = this.greetingService.generateSessionContinuation(
          user_name,
          context.currentWord,
          context.currentCategory
        );
      } else {
        greeting = await this.greetingService.generatePersonalizedGreeting({
          userName: user.user_name,
          sourceLanguage: user.source_language,
          targetLanguage: user.target_language,
          wordsInitiated: user.word_initiated as string[],
          wordProgress: user.word_progress as Record<string, string>
        });
      }

      // Initialize message history
      const messageHistory: ChatMessage[] = [
        {
          role: 'assistant',
          content: greeting
        }
      ];

      // Add initial user message if provided
      if (initial_message) {
        messageHistory.push({
          role: 'user',
          content: initial_message
        });
      }

      // Create session
      const sessionData: CreateSessionData = {
        user_id: user.id,
        message_history: messageHistory
      };

      const session = await SessionService.create(sessionData);

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          session: {
            id: session.id,
            user_id: session.user_id,
            created_at: session.created_at,
            message_count: messageHistory.length
          },
          user: {
            user_name: user.user_name,
            source_language: user.source_language,
            target_language: user.target_language
          },
          greeting,
          context: context || {
            currentWord: null,
            currentCategory: null
          },
          message: 'Session started successfully'
        }
      };

      console.log(`🎯 Started session ${session.id} for user ${user_name}`);
      res.status(201).json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in startSession:', error);
      throw createError.internal('Failed to start session');
    }
  });

  /**
   * Get session details
   * GET /api/sessions/:session_id
   */
  getSession = asyncHandler(async (req: Request, res: Response) => {
    const validation = GetSessionSchema.safeParse({ session_id: req.params.session_id });
    if (!validation.success) {
      throw createError.badRequest('Invalid session ID parameter');
    }

    const { session_id } = validation.data;

    try {
      const session = await SessionService.findById(session_id);
      
      if (!session) {
        throw createError.notFound(`Session '${session_id}' not found`);
      }

      // Get user details
      const user = await UserService.findById(session.user_id);
      if (!user) {
        throw createError.internal('Session user not found');
      }

      const messageHistory = session.message_history as ChatMessage[];

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          session: {
            id: session.id,
            user_id: session.user_id,
            created_at: session.created_at,
            message_count: messageHistory.length,
            last_activity: session.created_at // Can be enhanced with real last activity tracking
          },
          user: {
            user_name: user.user_name,
            source_language: user.source_language,
            target_language: user.target_language
          },
          message_history: messageHistory,
          session_stats: {
            duration: Math.floor((new Date().getTime() - new Date(session.created_at).getTime()) / 1000 / 60), // minutes
            messages_exchanged: messageHistory.length
          }
        }
      };

      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in getSession:', error);
      throw createError.internal('Failed to retrieve session');
    }
  });

  /**
   * Add message to session (non-streaming)
   * POST /api/sessions/:session_id/message
   */
  addMessage = asyncHandler(async (req: Request, res: Response) => {
    const validation = ContinueSessionSchema.safeParse({
      session_id: req.params.session_id,
      ...req.body
    });
    
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

      // Get current message history
      const currentHistory = session.message_history as ChatMessage[];

      // Add user message
      const newMessage: ChatMessage = {
        role: 'user',
        content: user_message
      };

      const updatedHistory = [...currentHistory, newMessage];

      // Update session with new message
      const updatedSession = await SessionService.updateMessages(session_id, updatedHistory);

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          session_id: session_id,
          message_added: newMessage,
          total_messages: updatedHistory.length,
          context: context || {
            currentWord: null,
            currentCategory: null
          },
          message: 'Message added to session'
        }
      };

      console.log(`💬 Added message to session ${session_id}`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in addMessage:', error);
      throw createError.internal('Failed to add message to session');
    }
  });

  /**
   * Get user's recent sessions
   * GET /api/sessions/user/:username
   */
  getUserSessions = asyncHandler(async (req: Request, res: Response) => {
    const username = req.params.username;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!username) {
      throw createError.badRequest('Username is required');
    }

    try {
      // Verify user exists
      const user = await UserService.findByUsername(username);
      if (!user) {
        throw createError.notFound(`User '${username}' not found`);
      }

      // Get user sessions
      const sessions = await SessionService.findByUserId(user.id, limit, offset);

      // Transform sessions for response
      const sessionsData = sessions.map(session => {
        const messageHistory = session.message_history as ChatMessage[];
        return {
          id: session.id,
          created_at: session.created_at,
          message_count: messageHistory.length,
          last_message: messageHistory[messageHistory.length - 1]?.content || null,
          duration_estimate: Math.floor((new Date().getTime() - new Date(session.created_at).getTime()) / 1000 / 60)
        };
      });

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          user_name: username,
          sessions: sessionsData,
          pagination: {
            limit,
            offset,
            total: sessionsData.length,
            has_more: sessionsData.length === limit
          },
          summary: {
            total_sessions: sessionsData.length,
            most_recent: sessionsData[0]?.created_at || null
          }
        }
      };

      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in getUserSessions:', error);
      throw createError.internal('Failed to retrieve user sessions');
    }
  });

  /**
   * Delete session
   * DELETE /api/sessions/:session_id
   */
  deleteSession = asyncHandler(async (req: Request, res: Response) => {
    const validation = GetSessionSchema.safeParse({ session_id: req.params.session_id });
    if (!validation.success) {
      throw createError.badRequest('Invalid session ID parameter');
    }

    const { session_id } = validation.data;

    try {
      // Verify session exists
      const session = await SessionService.findById(session_id);
      if (!session) {
        throw createError.notFound(`Session '${session_id}' not found`);
      }

      // Delete session
      await SessionService.delete(session_id);

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          session_id,
          message: 'Session deleted successfully'
        }
      };

      console.log(`🗑️  Deleted session ${session_id}`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in deleteSession:', error);
      throw createError.internal('Failed to delete session');
    }
  });
} 