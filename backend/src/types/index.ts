// User and Session related types
export interface User {
  id: string;
  user_name: string;
  source_language: string;
  target_language: string;
  word_initiated: string[];
  word_progress: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  message_history: ChatMessage[];
  created_at: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Database input types (for creating records)
export interface CreateUserData {
  user_name: string;
  source_language: string;
  target_language: string;
  word_initiated?: string[];
  word_progress?: Record<string, string>;
}

export interface CreateSessionData {
  user_id: string;
  message_history?: ChatMessage[];
}

// Server-Sent Events chunk types
export interface SSEChunk {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

// Service types
export interface AIServiceContext {
  currentWord?: string | null;
  currentCategory?: string | null;
  userLanguages: {
    source: string;
    target: string;
  };
}

// Error handling types
export interface ApiError {
  message: string;
  code: string;
  statusCode: number;
  details?: any;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// API Request/Response types
export interface StartSessionRequest {
  user_name: string;
  source_language: string;
  target_language: string;
}

export interface StartSessionResponse {
  session_id: string;
  greeting: string;
}

export interface ContinueSessionRequest {
  session_id: string;
  user_message: string;
}

export interface StreamingResponse {
  response: string;
  currentCategory?: string | null;
  currentWord?: string | null;
  currentWordProgress?: string | null;
  exercises?: ExerciseData | null;
}

// Exercise related types
export interface ExerciseData {
  basic: {
    unscrambled: string;
    scrambled: string;
  };
  intermediate: {
    unscrambled: string;
    scrambled: string;
  };
  advanced: {
    unscrambled: string;
    scrambled: string;
  };
  count: number;
}

// Environment configuration
export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  geminiApiKey: string;
  audioStoragePath: string;
  logLevel: string;
} 