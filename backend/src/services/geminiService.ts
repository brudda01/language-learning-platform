import { GoogleGenerativeAI, GenerativeModel, ChatSession } from '@google/generative-ai';
import { config } from '../config/index.js';
import { ChatMessage } from '../types/index.js';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });
  }

  /**
   * Generate streaming response for vocabulary tutoring
   */
  async generateTutoringResponse(
    messages: ChatMessage[],
    context: {
      currentWord?: string | null;
      currentCategory?: string | null;
      userLanguages: {
        source: string;
        target: string;
      };
    }
  ): Promise<AsyncIterableIterator<string>> {
    try {
      // Convert our ChatMessage format to Gemini format
      const geminiHistory = this.convertToGeminiHistory(messages);
      
      // Create system prompt for AI tutoring
      const systemPrompt = this.createSystemPrompt(context);
      
      // Add system prompt as first message in history
      const historyWithSystem = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'I understand. I\'m ready to help with vocabulary learning.' }] },
        ...geminiHistory
      ];

      // Start chat session with history
      const chat = this.model.startChat({
        history: historyWithSystem
      });

      // Get the last user message
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Invalid message history: last message must be from user');
      }

      // Generate streaming response
      const result = await chat.sendMessageStream(lastMessage.content);
      
      return this.createStreamIterator(result.stream);
    } catch (error) {
      console.error('Error generating Gemini response:', error);
      throw new Error(`AI service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate non-streaming response for simple queries
   */
  async generateResponse(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating Gemini response:', error);
      throw new Error(`AI service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert our ChatMessage format to Gemini's expected format
   */
  private convertToGeminiHistory(messages: ChatMessage[]) {
    return messages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  /**
   * Create system prompt based on our language learning methodology
   */
  private createSystemPrompt(context: {
    currentWord?: string | null;
    currentCategory?: string | null;
    userLanguages: { source: string; target: string };
  }): string {
    const { currentWord, currentCategory, userLanguages } = context;
    
    return `You are an AI vocabulary tutor for our language learning platform. Your role is to teach ${userLanguages.target} vocabulary to speakers of ${userLanguages.source}.

TEACHING METHODOLOGY:
1. **Category Selection**: Help users choose vocabulary categories
2. **Scenario Introduction**: Present real-world scenarios  
3. **Word Teaching**: For each word, teach in this order:
   - Meaning (simple definition + context)
   - Pronunciation (phonetic guide)
   - Example Sentences (3 practical examples)
   - Context Usage (when/where to use it)
4. **Exercise Generation**: Create unscrambling exercises

CURRENT CONTEXT:
- Category: ${currentCategory || 'Not selected'}
- Current Word: ${currentWord || 'None'}
- Teaching: ${userLanguages.source} → ${userLanguages.target}

RESPONSE STYLE:
- Conversational and encouraging
- Use simple language
- Provide practical, real-world examples
- Be patient and supportive
- Focus on practical usage over grammar rules

Always respond in ${userLanguages.source} when explaining, but teach words in ${userLanguages.target}.`;
  }

  /**
   * Create async iterator for streaming responses
   */
  private async* createStreamIterator(stream: any): AsyncIterableIterator<string> {
    try {
      for await (const chunk of stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          yield chunkText;
        }
      }
    } catch (error) {
      console.error('Error in stream iterator:', error);
      throw new Error('Streaming response failed');
    }
  }

  /**
   * Generate greeting message based on user progress
   */
  async generateGreeting(
    userName: string,
    wordsInitiated: string[],
    targetLanguage: string
  ): Promise<string> {
    const wordCount = wordsInitiated.length;
    
    let progressContext = '';
    if (wordCount === 0) {
      progressContext = 'This is their first time using our language learning platform.';
    } else if (wordCount < 10) {
      progressContext = `They have learned ${wordCount} words so far.`;
    } else if (wordCount < 50) {
      progressContext = `They are making good progress with ${wordCount} words learned.`;
    } else {
      progressContext = `They are an advanced learner with ${wordCount} words in their vocabulary.`;
    }

    const prompt = `Generate a personalized, encouraging greeting for ${userName} who is learning ${targetLanguage}. ${progressContext} 

Keep it:
- Warm and welcoming
- 1-2 sentences maximum
- Encouraging about their language learning journey
- Natural and conversational

Examples:
- "Welcome back, Sarah! Ready to add some new Spanish words to your growing vocabulary?"
- "Hi Ahmed! Great to see you again. Let's continue building your English skills together."`;

    return await this.generateResponse(prompt);
  }
} 