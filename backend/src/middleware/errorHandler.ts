import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types/index.js';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';

  // Handle known application errors
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  }
  // Handle specific error types
  else if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = error.message;
  }
  else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Authentication required';
  }
  else if (error.message.includes('Database')) {
    statusCode = 503;
    code = 'DATABASE_ERROR';
    message = 'Database service unavailable';
  }
  else if (error.message.includes('AI service')) {
    statusCode = 503;
    code = 'AI_SERVICE_ERROR';
    message = 'AI service temporarily unavailable';
  }

  // Log error for debugging (in production, use proper logging service)
  console.error('Error Handler:', {
    message: error.message,
    stack: error.stack,
    statusCode,
    code,
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Construct API error response
  const apiError: ApiError = {
    message,
    code,
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { 
      details: error.stack 
    })
  };

  res.status(statusCode).json({
    success: false,
    error: apiError
  });
};

/**
 * Handle 404 Not Found errors
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const apiError: ApiError = {
    message: `Route ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
    statusCode: 404
  };

  res.status(404).json({
    success: false,
    error: apiError
  });
};

/**
 * Async error wrapper to catch promise rejections
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Common error creators
 */
export const createError = {
  badRequest: (message: string) => new AppError(message, 400, 'BAD_REQUEST'),
  unauthorized: (message: string = 'Unauthorized') => new AppError(message, 401, 'UNAUTHORIZED'),
  forbidden: (message: string = 'Forbidden') => new AppError(message, 403, 'FORBIDDEN'),
  notFound: (message: string) => new AppError(message, 404, 'NOT_FOUND'),
  conflict: (message: string) => new AppError(message, 409, 'CONFLICT'),
  unprocessable: (message: string) => new AppError(message, 422, 'UNPROCESSABLE_ENTITY'),
  internal: (message: string = 'Internal server error') => new AppError(message, 500, 'INTERNAL_ERROR'),
  service: (message: string) => new AppError(message, 503, 'SERVICE_UNAVAILABLE')
}; 