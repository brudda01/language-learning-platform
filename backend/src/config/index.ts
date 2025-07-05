import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  geminiApiKey: string;
  audioStoragePath: string;
  logLevel: string;
}

// Configuration object with dynamic getters
export const config: AppConfig = {
  get port() {
    return parseInt(process.env.PORT || '3001', 10);
  },
  
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },
  
  get databaseUrl() {
    return process.env.DATABASE_URL || 'postgresql://localhost:5432/language_learning';
  },
  
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || '';
  },
  
  get audioStoragePath() {
    return process.env.AUDIO_STORAGE_PATH || './uploads/audio';
  },
  
  get logLevel() {
    return process.env.LOG_LEVEL || 'info';
  }
};

// Environment validation
export const validateConfig = (): void => {
  const requiredEnvVars = [
    'DATABASE_URL',
    'GEMINI_API_KEY'
  ];
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.warn('⚠️  Missing required environment variables:', missing);
    console.log('📝 Please create a .env file with:');
    console.log('DATABASE_URL="postgresql://username:password@localhost:5432/language_learning_db"');
    console.log('GEMINI_API_KEY="your_gemini_api_key_here"');
    console.log('PORT=3001');
    console.log('NODE_ENV="development"');
    
    // Don't exit in development, just warn
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Cannot start in production without required environment variables');
      process.exit(1);
    }
  } else {
    console.log('✅ Environment configuration validated');
  }
}; 