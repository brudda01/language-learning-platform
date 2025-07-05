import { Request, Response } from 'express';
import { z } from 'zod';
import { UserService } from '../utils/database.js';
import { GreetingService } from '../utils/greetingService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { ServiceResponse, CreateUserData } from '../types/index.js';

// Request validation schemas
const CreateUserSchema = z.object({
  user_name: z.string().min(1, 'Username is required').max(50, 'Username too long'),
  source_language: z.string().min(1, 'Source language is required'),
  target_language: z.string().min(1, 'Target language is required'),
  word_initiated: z.array(z.string()).optional().default([]),
  word_progress: z.record(z.string()).optional().default({})
});

const GetUserSchema = z.object({
  user_name: z.string().min(1, 'Username is required')
});

const UpdateUserProgressSchema = z.object({
  user_name: z.string().min(1, 'Username is required'),
  word_initiated: z.array(z.string()).optional(),
  word_progress: z.record(z.string()).optional()
});

export class UserController {
  private greetingService: GreetingService;

  constructor() {
    this.greetingService = new GreetingService();
  }

  /**
   * Create new user or get existing user
   * POST /api/users/start-session
   */
  startSession = asyncHandler(async (req: Request, res: Response) => {
    // Validate request body
    const validation = CreateUserSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const userData = validation.data;

    try {
      // Check if user already exists
      let user = await UserService.findByUsername(userData.user_name);
      let isNewUser = false;

      if (!user) {
        // Create new user
        user = await UserService.create(userData as CreateUserData);
        isNewUser = true;
        console.log(`✅ Created new user: ${userData.user_name}`);
      } else {
        console.log(`👋 Existing user: ${userData.user_name}`);
      }

      // Generate personalized greeting
      const greeting = await this.greetingService.generatePersonalizedGreeting({
        userName: user.user_name,
        sourceLanguage: user.source_language,
        targetLanguage: user.target_language,
        wordsInitiated: user.word_initiated as string[],
        wordProgress: user.word_progress as Record<string, string>
      });

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          user: {
            id: user.id,
            user_name: user.user_name,
            source_language: user.source_language,
            target_language: user.target_language,
            word_initiated: user.word_initiated,
            word_progress: user.word_progress,
            created_at: user.created_at
          },
          greeting,
          isNewUser,
          message: isNewUser ? 'User created successfully' : 'Welcome back!'
        }
      };

      res.status(isNewUser ? 201 : 200).json(response);

    } catch (error) {
      console.error('Error in startSession:', error);
      throw createError.internal('Failed to start user session');
    }
  });

  /**
   * Get user by username
   * GET /api/users/:username
   */
  getUser = asyncHandler(async (req: Request, res: Response) => {
    const validation = GetUserSchema.safeParse({ user_name: req.params.username });
    if (!validation.success) {
      throw createError.badRequest('Invalid username parameter');
    }

    const { user_name } = validation.data;

    try {
      const user = await UserService.findByUsername(user_name);
      
      if (!user) {
        throw createError.notFound(`User '${user_name}' not found`);
      }

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          user: {
            id: user.id,
            user_name: user.user_name,
            source_language: user.source_language,
            target_language: user.target_language,
            word_initiated: user.word_initiated,
            word_progress: user.word_progress,
            created_at: user.created_at,
            progress_summary: {
              total_words: (user.word_initiated as string[]).length,
              completed_words: Object.values(user.word_progress as Record<string, string>)
                .filter(status => status === 'completed' || status === 'mastered').length
            }
          }
        }
      };

      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in getUser:', error);
      throw createError.internal('Failed to retrieve user');
    }
  });

  /**
   * Update user progress
   * PUT /api/users/:username/progress
   */
  updateProgress = asyncHandler(async (req: Request, res: Response) => {
    const validation = UpdateUserProgressSchema.safeParse({
      user_name: req.params.username,
      ...req.body
    });
    
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { user_name, word_initiated, word_progress } = validation.data;

    try {
      // Verify user exists
      const existingUser = await UserService.findByUsername(user_name);
      if (!existingUser) {
        throw createError.notFound(`User '${user_name}' not found`);
      }

      // Update user progress
      const updatedUser = await UserService.updateProgress(
        user_name,
        word_initiated || (existingUser.word_initiated as string[]),
        word_progress || (existingUser.word_progress as Record<string, string>)
      );

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          user: {
            id: updatedUser.id,
            user_name: updatedUser.user_name,
            source_language: updatedUser.source_language,
            target_language: updatedUser.target_language,
            word_initiated: updatedUser.word_initiated,
            word_progress: updatedUser.word_progress,
            updated_at: updatedUser.updated_at
          },
          message: 'Progress updated successfully'
        }
      };

      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in updateProgress:', error);
      throw createError.internal('Failed to update user progress');
    }
  });

  /**
   * Get user statistics
   * GET /api/users/:username/stats
   */
  getUserStats = asyncHandler(async (req: Request, res: Response) => {
    const validation = GetUserSchema.safeParse({ user_name: req.params.username });
    if (!validation.success) {
      throw createError.badRequest('Invalid username parameter');
    }

    const { user_name } = validation.data;

    try {
      const user = await UserService.findByUsername(user_name);
      
      if (!user) {
        throw createError.notFound(`User '${user_name}' not found`);
      }

      const wordsInitiated = user.word_initiated as string[];
      const wordProgress = user.word_progress as Record<string, string>;

      // Calculate statistics
      const totalWords = wordsInitiated.length;
      const completedWords = Object.values(wordProgress)
        .filter(status => status === 'completed' || status === 'mastered').length;
      const inProgressWords = Object.values(wordProgress)
        .filter(status => status === 'in_progress' || status === 'learning').length;
      const strugglingWords = Object.values(wordProgress)
        .filter(status => status === 'struggling' || status === 'needs_review').length;

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          user_name: user.user_name,
          learning_languages: {
            source: user.source_language,
            target: user.target_language
          },
          statistics: {
            total_words: totalWords,
            completed_words: completedWords,
            in_progress_words: inProgressWords,
            struggling_words: strugglingWords,
            completion_rate: totalWords > 0 ? Math.round((completedWords / totalWords) * 100) : 0,
            learning_streak: totalWords,  // Can be enhanced with date-based calculation
            level: this.calculateUserLevel(totalWords, completedWords)
          },
          recent_words: wordsInitiated.slice(-10).reverse() // Last 10 words learned
        }
      };

      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in getUserStats:', error);
      throw createError.internal('Failed to retrieve user statistics');
    }
  });

  /**
   * Calculate user level based on progress
   */
  private calculateUserLevel(totalWords: number, completedWords: number): string {
    if (totalWords === 0) return 'Beginner';
    if (totalWords < 10) return 'Beginner';
    if (totalWords < 50) return 'Elementary';
    if (totalWords < 100) return 'Intermediate';
    if (totalWords < 250) return 'Upper Intermediate';
    if (totalWords < 500) return 'Advanced';
    return 'Expert';
  }
} 