import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/AppError';
import { logger } from '../logger';
import { env } from '../../config/env';

interface MongoError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  logger.error(`[${req.method}] ${req.originalUrl}`, {
    message: err.message,
    name: err.name,
  });

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: err.errors[0]?.message ?? 'Validation error',
      errors: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  const mongoErr = err as MongoError;
  if (mongoErr.code === 11000) {
    const field = Object.keys(mongoErr.keyValue ?? {})[0] ?? 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  if (err.message?.includes('File too large')) {
    return res.status(413).json({
      success: false,
      message: 'File too large. Maximum size is 25MB.',
    });
  }

  const isProd = env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : err.message,
  });
}
