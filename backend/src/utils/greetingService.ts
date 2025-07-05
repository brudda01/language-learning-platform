import { GeminiService } from '../services/geminiService.js';

export interface GreetingContext {
  userName: string;
  sourceLanguage: string;
  targetLanguage: string;
  wordsInitiated: string[];
  wordProgress: Record<string, string>;
  lastSessionTime?: Date;
}

export class GreetingService {
  private geminiService: GeminiService;

  constructor() {
    this.geminiService = new GeminiService();
  }

  /**
   * Generate personalized greeting based on user progress
   * Creates contextual, encouraging messages for learning sessions
   */
  async generatePersonalizedGreeting(context: GreetingContext): Promise<string> {
    try {
      // Analyze user progress
      const progressAnalysis = this.analyzeUserProgress(context);
      
      // Use Gemini to generate contextual greeting
      const greeting = await this.geminiService.generateGreeting(
        context.userName,
        context.wordsInitiated,
        context.targetLanguage
      );

      // Add progress-specific encouragement
      const enhancedGreeting = this.enhanceGreetingWithProgress(greeting, progressAnalysis);
      
      return enhancedGreeting;
    } catch (error) {
      console.error('Error generating personalized greeting:', error);
      // Fallback to static greeting
      return this.generateFallbackGreeting(context);
    }
  }

  /**
   * Generate quick welcome message for returning users
   */
  generateQuickWelcome(context: GreetingContext): string {
    const { userName, wordsInitiated } = context;
    const wordCount = wordsInitiated.length;

    if (wordCount === 0) {
      return `Welcome to our language learning platform, ${userName}! Ready to start your ${context.targetLanguage} learning journey?`;
    } else if (wordCount < 10) {
      return `Hi ${userName}! You're off to a great start with ${wordCount} words. Let's learn more!`;
    } else if (wordCount < 50) {
      return `Welcome back, ${userName}! ${wordCount} words and counting. You're doing amazing!`;
    } else {
      return `Hello ${userName}! Impressive vocabulary of ${wordCount} words. Ready for today's challenge?`;
    }
  }

  /**
   * Generate session continuation message
   */
  generateSessionContinuation(
    userName: string,
    currentWord: string | null,
    currentCategory: string | null
  ): string {
    if (currentWord && currentCategory) {
      return `Welcome back, ${userName}! Let's continue learning "${currentWord}" in the ${currentCategory} category.`;
    } else if (currentCategory) {
      return `Hi ${userName}! Ready to explore more words in the ${currentCategory} category?`;
    } else {
      return `Welcome back, ${userName}! What would you like to learn today?`;
    }
  }

  /**
   * Private helper methods
   */

  private analyzeUserProgress(context: GreetingContext) {
    const { wordsInitiated, wordProgress } = context;
    const totalWords = wordsInitiated.length;
    
    // Calculate completion rates
    const progressEntries = Object.values(wordProgress);
    const completedWords = progressEntries.filter(progress => 
      progress === 'completed' || progress === 'mastered'
    ).length;
    
    const strugglingWords = progressEntries.filter(progress => 
      progress === 'struggling' || progress === 'needs_review'
    ).length;

    return {
      totalWords,
      completedWords,
      strugglingWords,
      completionRate: totalWords > 0 ? (completedWords / totalWords) * 100 : 0,
      isNewUser: totalWords === 0,
      isBeginner: totalWords < 10,
      isIntermediate: totalWords >= 10 && totalWords < 50,
      isAdvanced: totalWords >= 50
    };
  }

  private enhanceGreetingWithProgress(
    baseGreeting: string, 
    progress: ReturnType<typeof this.analyzeUserProgress>
  ): string {
    if (progress.isNewUser) {
      return `${baseGreeting} I'm excited to be your vocabulary learning companion!`;
    }

    if (progress.completionRate > 80) {
      return `${baseGreeting} Your ${progress.completionRate.toFixed(0)}% completion rate is outstanding!`;
    }

    if (progress.strugglingWords > 0) {
      return `${baseGreeting} I noticed you might want to review ${progress.strugglingWords} words we've covered.`;
    }

    return baseGreeting;
  }

  private generateFallbackGreeting(context: GreetingContext): string {
    const { userName, wordsInitiated, targetLanguage } = context;
    const templates = [
      `Hello ${userName}! Ready to expand your ${targetLanguage} vocabulary?`,
      `Welcome back, ${userName}! Let's continue your ${targetLanguage} learning journey.`,
      `Hi ${userName}! Time to discover some amazing ${targetLanguage} words today.`,
      `Great to see you, ${userName}! Your ${targetLanguage} skills are about to get even better.`
    ];

    // Choose template based on word count
    const wordCount = wordsInitiated.length;
    if (wordCount === 0) return templates[0];
    if (wordCount < 25) return templates[1];
    if (wordCount < 75) return templates[2];
    return templates[3];
  }
} 