import { PrismaClient } from '@prisma/client';
import { User, Session, CreateUserData, CreateSessionData, ChatMessage } from '../types/index.js';

// Initialize Prisma client
const prisma = new PrismaClient();

// Export the prisma client
export { prisma };

// Database connection test
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// User operations
export class UserService {
  
  // Find user by username
  static async findByUsername(username: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { user_name: username }
      });
      return user as User | null;
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw error;
    }
  }

  // Create new user
  static async create(userData: CreateUserData): Promise<User> {
    try {
      const user = await prisma.user.create({
        data: {
          user_name: userData.user_name,
          source_language: userData.source_language,
          target_language: userData.target_language,
          word_initiated: userData.word_initiated || [],
          word_progress: userData.word_progress || {}
        }
      });
      return user as User;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Update existing user
  static async update(userId: string, updateData: Partial<CreateUserData>): Promise<User> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData
      });
      return user as User;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Find user by ID
  static async findById(userId: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      return user as User | null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }

  // Update user progress
  static async updateProgress(
    username: string,
    wordInitiated: string[],
    wordProgress: Record<string, string>
  ): Promise<User> {
    try {
      return await prisma.user.update({
        where: { user_name: username },
        data: {
          word_initiated: wordInitiated as any,
          word_progress: wordProgress as any,
          updated_at: new Date()
        }
      }) as User;
    } catch (error) {
      console.error('Error updating user progress:', error);
      throw error;
    }
  }

  // Delete user
  static async delete(username: string): Promise<void> {
    try {
      await prisma.user.delete({
        where: { user_name: username }
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }
}

// Session operations
export class SessionService {
  
  // Create new session
  static async create(sessionData: CreateSessionData): Promise<Session> {
    try {
      const session = await prisma.session.create({
        data: {
          user_id: sessionData.user_id,
          message_history: (sessionData.message_history || []) as any
        }
      });
      return session as unknown as Session;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  // Find session by ID
  static async findById(sessionId: string): Promise<Session | null> {
    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          user: true  // Include user data for convenience
        }
      });
      return session as Session | null;
    } catch (error) {
      console.error('Error finding session by ID:', error);
      throw error;
    }
  }

  // Update session messages (used by controllers)
  static async updateMessages(sessionId: string, messages: ChatMessage[]): Promise<Session> {
    try {
      const session = await prisma.session.update({
        where: { id: sessionId },
        data: {
          message_history: messages as any
        }
      });
      return session as unknown as Session;
    } catch (error) {
      console.error('Error updating session messages:', error);
      throw error;
    }
  }

  // Find sessions by user ID
  static async findByUserId(userId: string, limit: number = 10, offset: number = 0): Promise<Session[]> {
    try {
      return await prisma.session.findMany({
        where: { user_id: userId },
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' }
      }) as unknown as Session[];
    } catch (error) {
      console.error('Error finding sessions by user ID:', error);
      throw error;
    }
  }

  // Delete session
  static async delete(sessionId: string): Promise<void> {
    try {
      await prisma.session.delete({
        where: { id: sessionId }
      });
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }
} 