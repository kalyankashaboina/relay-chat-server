import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../errors/AppError';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  // const isProd = process.env.NODE_ENV === "production";

  // Structured internal logging
  console.error(`[ERROR] ${req.method} ${req.originalUrl}`);
  console.error({
    message: err.message,
    stack: err.stack,
  });

  // Operational errors (expected)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Unknown / programming errors
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}
