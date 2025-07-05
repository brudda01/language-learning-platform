import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { config } from '../config/index.js';

const require = createRequire(import.meta.url);
const gTTS = require('gtts');

export interface TTSOptions {
  text: string;
  language?: string;
  voice?: string;
  speed?: number;
}

export interface TTSResult {
  audioPath: string;
  audioUrl: string;
  cached: boolean;
}

export class TextToSpeechService {
  private audioStoragePath: string;

  constructor() {
    this.audioStoragePath = config.audioStoragePath;
    this.ensureAudioDirectory();
  }

  /**
   * Generate speech audio from text
   */
  async generateSpeech(options: TTSOptions): Promise<TTSResult> {
    try {
      // Create a hash of the text + options for caching
      const textHash = this.createTextHash(options);
      const fileName = `${textHash}.mp3`;
      const audioPath = path.join(this.audioStoragePath, fileName);
      const audioUrl = `/audio/${fileName}`;

      // Check if audio already exists (caching)
      if (await this.fileExists(audioPath)) {
        return {
          audioPath,
          audioUrl,
          cached: true
        };
      }

      // Generate new audio file
      await this.generateAudioFile(options, audioPath);

      return {
        audioPath,
        audioUrl,
        cached: false
      };
    } catch (error) {
      console.error('Error generating speech:', error);
      throw new Error(`Text-to-speech generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate audio for vocabulary word with pronunciation guide
   */
  async generateVocabularyAudio(
    word: string,
    language: string,
    includeSlowVersion: boolean = true
  ): Promise<{ normal: TTSResult; slow?: TTSResult }> {
    // Generate normal speed audio
    const normal = await this.generateSpeech({
      text: word,
      language,
      speed: 1.0
    });

    let slow: TTSResult | undefined;
    if (includeSlowVersion) {
      // Generate slow speed audio for pronunciation practice
      slow = await this.generateSpeech({
        text: word,
        language,
        speed: 0.7
      });
    }

    return { normal, slow };
  }

  /**
   * Generate audio for example sentences
   */
  async generateSentenceAudio(
    sentences: string[],
    language: string
  ): Promise<TTSResult[]> {
    const audioPromises = sentences.map(sentence => 
      this.generateSpeech({
        text: sentence,
        language,
        speed: 0.9 // Slightly slower for clarity
      })
    );

    return Promise.all(audioPromises);
  }

  /**
   * Clean up old audio files (for maintenance)
   */
  async cleanupOldFiles(maxAgeHours: number = 24): Promise<number> {
    try {
      const files = await fs.readdir(this.audioStoragePath);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.audioStoragePath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      console.log(`Cleaned up ${deletedCount} old audio files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up audio files:', error);
      return 0;
    }
  }

  /**
   * Get list of supported languages (gTTS supported)
   */
  getSupportedLanguages(): string[] {
    // gTTS supported languages
    return [
      'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE', 
      'it-IT', 'pt-BR', 'pt-PT', 'ja-JP', 'ko-KR', 'zh-CN', 
      'zh-TW', 'ar-SA', 'hi-IN', 'ru-RU', 'th-TH', 'vi-VN',
      'af', 'sq', 'am', 'ar', 'hy', 'az', 'eu', 'be', 'bn',
      'bs', 'bg', 'ca', 'ceb', 'ny', 'zh', 'co', 'hr', 'cs',
      'da', 'nl', 'en', 'eo', 'et', 'tl', 'fi', 'fr', 'fy',
      'gl', 'ka', 'de', 'el', 'gu', 'ht', 'ha', 'haw', 'iw',
      'hi', 'hmn', 'hu', 'is', 'ig', 'id', 'ga', 'it', 'ja',
      'jw', 'kn', 'kk', 'km', 'ko', 'ku', 'ky', 'lo', 'la',
      'lv', 'lt', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'mi',
      'mr', 'mn', 'my', 'ne', 'no', 'ps', 'fa', 'pl', 'pt',
      'pa', 'ro', 'ru', 'sm', 'gd', 'sr', 'st', 'sn', 'sd',
      'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv', 'tg',
      'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'cy',
      'xh', 'yi', 'yo', 'zu'
    ];
  }

  /**
   * Private Methods
   */

  private async ensureAudioDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.audioStoragePath, { recursive: true });
    } catch (error) {
      console.error('Error creating audio directory:', error);
      throw new Error('Failed to initialize audio storage');
    }
  }

  private createTextHash(options: TTSOptions): string {
    const hashData = `${options.text}-${options.language || 'en'}-${options.voice || 'default'}-${options.speed || 1.0}`;
    return crypto.createHash('md5').update(hashData).digest('hex');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async generateAudioFile(options: TTSOptions, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Map language codes to gTTS format
        const language = this.mapLanguageToGTTS(options.language || 'en');
        
        // Create gTTS instance
        const gtts = new gTTS(options.text, language);
        
        // Generate and save audio file
        gtts.save(outputPath, (error: any) => {
          if (error) {
            console.error('gTTS generation error:', error);
            reject(new Error(`Failed to generate audio: ${error.message || error}`));
          } else {
            console.log(`📢 Generated audio: "${options.text}" (${language}) -> ${path.basename(outputPath)}`);
            resolve();
          }
        });
      } catch (error) {
        console.error('gTTS setup error:', error);
        reject(new Error(`TTS service error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  /**
   * Map language codes to gTTS supported languages
   */
  private mapLanguageToGTTS(language: string): string {
    const languageMap: Record<string, string> = {
      'en-US': 'en',
      'en-GB': 'en',
      'es-ES': 'es',
      'es-MX': 'es',
      'fr-FR': 'fr',
      'de-DE': 'de',
      'it-IT': 'it',
      'pt-BR': 'pt',
      'pt-PT': 'pt',
      'ja-JP': 'ja',
      'ko-KR': 'ko',
      'zh-CN': 'zh',
      'zh-TW': 'zh-tw',
      'ar-SA': 'ar',
      'hi-IN': 'hi',
      'ru-RU': 'ru',
      'th-TH': 'th',
      'vi-VN': 'vi'
    };

    // Return mapped language or fallback to the base language code
    return languageMap[language] || language.split('-')[0] || 'en';
  }
} 