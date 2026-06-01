import type { RequestHandler } from 'express';

/** Wraps an async route handler and forwards any rejection to Express next() */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
