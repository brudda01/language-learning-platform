import { Request, Response, NextFunction } from 'express';

export interface RequestLogData {
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  timestamp: string;
  responseTime?: number;
  statusCode?: number;
  contentLength?: number;
}

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Basic request info
  const logData: RequestLogData = {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent'),
    timestamp
  };

  // Log request start (in development only)
  if (process.env.NODE_ENV === 'development') {
    console.log(`📥 ${logData.method} ${logData.url} - ${logData.ip}`);
  }

  // Capture response details
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(body) {
    logData.contentLength = Buffer.byteLength(body);
    return originalSend.call(this, body);
  };

  res.json = function(obj) {
    logData.contentLength = Buffer.byteLength(JSON.stringify(obj));
    return originalJson.call(this, obj);
  };

  // Log response when finished
  res.on('finish', () => {
    logData.responseTime = Date.now() - startTime;
    logData.statusCode = res.statusCode;

    // Choose appropriate log level based on status code
    const isError = res.statusCode >= 400;
    const isWarning = res.statusCode >= 300 && res.statusCode < 400;

    // Format log message
    const statusEmoji = getStatusEmoji(res.statusCode);
    const colorCode = getColorCode(res.statusCode);
    
    const logMessage = `${statusEmoji} [${logData.timestamp}] ${logData.method} ${logData.url} - ${logData.statusCode} - ${logData.responseTime}ms - ${logData.contentLength || 0}B - ${logData.ip}`;

    // Log with appropriate level
    if (isError) {
      console.error(colorCode + logMessage + '\x1b[0m');
    } else if (isWarning) {
      console.warn(colorCode + logMessage + '\x1b[0m');
    } else {
      console.log(colorCode + logMessage + '\x1b[0m');
    }

    // Additional error logging for 5xx errors
    if (res.statusCode >= 500) {
      console.error('🚨 Server Error Details:', {
        ...logData,
        headers: req.headers,
        body: req.body,
        params: req.params,
        query: req.query
      });
    }
  });

  next();
};

/**
 * Health check specific logger (simplified)
 */
export const healthCheckLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Skip verbose logging for health checks
  if (req.originalUrl === '/health' || req.originalUrl === '/') {
    return next();
  }
  
  return requestLogger(req, res, next);
};

/**
 * API route specific logger with additional context
 */
export const apiLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Add request ID for tracking
  const requestId = generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  console.log(`🔍 [${requestId}] API ${req.method} ${req.originalUrl} started`);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusEmoji = getStatusEmoji(res.statusCode);
    
    console.log(`${statusEmoji} [${requestId}] API ${req.method} ${req.originalUrl} completed - ${res.statusCode} - ${duration}ms`);
  });

  next();
};

/**
 * Helper functions
 */

function getStatusEmoji(statusCode: number): string {
  if (statusCode < 300) return '✅';
  if (statusCode < 400) return '↩️';
  if (statusCode < 500) return '⚠️';
  return '❌';
}

function getColorCode(statusCode: number): string {
  if (statusCode < 300) return '\x1b[32m'; // Green
  if (statusCode < 400) return '\x1b[33m'; // Yellow
  if (statusCode < 500) return '\x1b[35m'; // Magenta
  return '\x1b[31m'; // Red
}

function generateRequestId(): string {
  return Math.random().toString(36).substr(2, 9);
} 