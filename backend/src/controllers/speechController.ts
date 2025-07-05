import { Request, Response } from 'express';
import { z } from 'zod';
import { TextToSpeechService } from '../services/textToSpeechService.js';
import { UserService } from '../utils/database.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { ServiceResponse } from '../types/index.js';

// Request validation schemas
const GenerateSpeechSchema = z.object({
  text: z.string().min(1, 'Text is required').max(500, 'Text too long'),
  language: z.string().optional().default('en-US'),
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
  voice: z.string().optional()
});

const GenerateVocabAudioSchema = z.object({
  word: z.string().min(1, 'Word is required'),
  language: z.string().optional().default('en-US'),
  include_slow: z.boolean().optional().default(true),
  user_name: z.string().optional()
});

const GenerateSentenceAudioSchema = z.object({
  sentences: z.array(z.string().min(1)).min(1, 'At least one sentence is required').max(10, 'Too many sentences'),
  language: z.string().optional().default('en-US'),
  speed: z.number().min(0.5).max(2.0).optional().default(0.9),
  user_name: z.string().optional()
});

const BulkGenerateSchema = z.object({
  words: z.array(z.string().min(1)).min(1, 'At least one word is required').max(20, 'Too many words'),
  language: z.string().optional().default('en-US'),
  user_name: z.string().optional()
});

export class SpeechController {
  private ttsService: TextToSpeechService;

  constructor() {
    this.ttsService = new TextToSpeechService();
  }

  /**
   * Generate speech audio from text
   * POST /api/speech/generate
   */
  generateSpeech = asyncHandler(async (req: Request, res: Response) => {
    const validation = GenerateSpeechSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { text, language, speed, voice } = validation.data;

    try {
      console.log(`🎵 Generating speech for text: "${text}" (${language})`);

      const audioResult = await this.ttsService.generateSpeech({
        text,
        language,
        speed,
        voice
      });

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          text,
          language,
          speed,
          audio: {
            url: audioResult.audioUrl,
            path: audioResult.audioPath,
            cached: audioResult.cached
          },
          generation_time: new Date().toISOString()
        }
      };

      console.log(`✅ Generated speech audio: ${audioResult.audioUrl}`);
      res.json(response);

    } catch (error) {
      console.error('Error in generateSpeech:', error);
      throw createError.internal('Failed to generate speech audio');
    }
  });

  /**
   * Generate vocabulary word audio (normal + slow)
   * POST /api/speech/vocabulary
   */
  generateVocabularyAudio = asyncHandler(async (req: Request, res: Response) => {
    const validation = GenerateVocabAudioSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { word, language, include_slow, user_name } = validation.data;

    try {
      // Validate user if provided
      if (user_name) {
        const user = await UserService.findByUsername(user_name);
        if (!user) {
          throw createError.notFound(`User '${user_name}' not found`);
        }
      }

      console.log(`🎵 Generating vocabulary audio for word: "${word}" (${language})`);

      const audioResult = await this.ttsService.generateVocabularyAudio(
        word,
        language,
        include_slow
      );

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          word,
          language,
          user_name,
          audio: {
            normal: {
              url: audioResult.normal.audioUrl,
              path: audioResult.normal.audioPath,
              cached: audioResult.normal.cached,
              speed: 'normal'
            },
            slow: include_slow && audioResult.slow ? {
              url: audioResult.slow.audioUrl,
              path: audioResult.slow.audioPath,
              cached: audioResult.slow.cached,
              speed: 'slow'
            } : null
          },
          generation_time: new Date().toISOString()
        }
      };

      console.log(`✅ Generated vocabulary audio for: ${word}`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in generateVocabularyAudio:', error);
      throw createError.internal('Failed to generate vocabulary audio');
    }
  });

  /**
   * Generate audio for multiple sentences
   * POST /api/speech/sentences
   */
  generateSentenceAudio = asyncHandler(async (req: Request, res: Response) => {
    const validation = GenerateSentenceAudioSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { sentences, language, speed, user_name } = validation.data;

    try {
      // Validate user if provided
      if (user_name) {
        const user = await UserService.findByUsername(user_name);
        if (!user) {
          throw createError.notFound(`User '${user_name}' not found`);
        }
      }

      console.log(`🎵 Generating sentence audio for ${sentences.length} sentences (${language})`);

      const audioResults = await this.ttsService.generateSentenceAudio(sentences, language);

      // Map results to response format
      const audioData = sentences.map((sentence, index) => ({
        sentence,
        index: index + 1,
        audio: {
          url: audioResults[index].audioUrl,
          path: audioResults[index].audioPath,
          cached: audioResults[index].cached
        }
      }));

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          sentence_count: sentences.length,
          language,
          speed,
          user_name,
          audio_files: audioData,
          generation_time: new Date().toISOString()
        }
      };

      console.log(`✅ Generated audio for ${sentences.length} sentences`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in generateSentenceAudio:', error);
      throw createError.internal('Failed to generate sentence audio');
    }
  });

  /**
   * Bulk generate audio for multiple words
   * POST /api/speech/bulk-vocabulary
   */
  bulkGenerateVocabulary = asyncHandler(async (req: Request, res: Response) => {
    const validation = BulkGenerateSchema.safeParse(req.body);
    if (!validation.success) {
      throw createError.badRequest(`Invalid request data: ${validation.error.message}`);
    }

    const { words, language, user_name } = validation.data;

    try {
      // Validate user if provided
      if (user_name) {
        const user = await UserService.findByUsername(user_name);
        if (!user) {
          throw createError.notFound(`User '${user_name}' not found`);
        }
      }

      console.log(`🎵 Bulk generating audio for ${words.length} words (${language})`);

      // Generate audio for all words
      const audioPromises = words.map(word => 
        this.ttsService.generateVocabularyAudio(word, language, true)
      );

      const audioResults = await Promise.all(audioPromises);

      // Map results to response format
      const audioData = words.map((word, index) => ({
        word,
        index: index + 1,
        audio: {
          normal: {
            url: audioResults[index].normal.audioUrl,
            path: audioResults[index].normal.audioPath,
            cached: audioResults[index].normal.cached
          },
          slow: audioResults[index].slow ? {
            url: audioResults[index].slow!.audioUrl,
            path: audioResults[index].slow!.audioPath,
            cached: audioResults[index].slow!.cached
          } : null
        }
      }));

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          word_count: words.length,
          language,
          user_name,
          audio_files: audioData,
          generation_time: new Date().toISOString(),
          cache_stats: {
            total: audioResults.length * 2, // normal + slow
            cached: audioResults.reduce((acc, result) => 
              acc + (result.normal.cached ? 1 : 0) + (result.slow?.cached ? 1 : 0), 0
            )
          }
        }
      };

      console.log(`✅ Bulk generated audio for ${words.length} words`);
      res.json(response);

    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }
      console.error('Error in bulkGenerateVocabulary:', error);
      throw createError.internal('Failed to bulk generate vocabulary audio');
    }
  });

  /**
   * Get supported languages
   * GET /api/speech/languages
   */
  getSupportedLanguages = asyncHandler(async (req: Request, res: Response) => {
    try {
      const languages = this.ttsService.getSupportedLanguages();

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          languages,
          total_count: languages.length,
          provider: 'Google Text-to-Speech (gTTS)',
          note: 'Language codes follow ISO 639-1 standard with regional variants'
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Error in getSupportedLanguages:', error);
      throw createError.internal('Failed to retrieve supported languages');
    }
  });

  /**
   * Clean up old audio files
   * DELETE /api/speech/cleanup
   */
  cleanupAudioFiles = asyncHandler(async (req: Request, res: Response) => {
    const maxAgeHours = parseInt(req.query.max_age_hours as string) || 24;

    try {
      console.log(`🧹 Starting audio cleanup (max age: ${maxAgeHours} hours)`);

      const deletedCount = await this.ttsService.cleanupOldFiles(maxAgeHours);

      const response: ServiceResponse<any> = {
        success: true,
        data: {
          deleted_files: deletedCount,
          max_age_hours: maxAgeHours,
          cleanup_time: new Date().toISOString(),
          message: `Cleaned up ${deletedCount} old audio files`
        }
      };

      console.log(`✅ Audio cleanup completed: ${deletedCount} files removed`);
      res.json(response);

    } catch (error) {
      console.error('Error in cleanupAudioFiles:', error);
      throw createError.internal('Failed to cleanup audio files');
    }
  });
} 