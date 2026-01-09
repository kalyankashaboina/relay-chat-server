import type { Request, Response, NextFunction } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { User } from '../users/user.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';

interface JwtPayload {
  userId: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    logger.info('Authenticating request', { headers: req.headers });
    logger.info('Cookies', { cookies: req.cookies });
    const token = req.cookies?.relay_token;

    if (!token) {
      logger.warn('Auth failed: missing token');
      throw new AppError('Unauthorized', 401);
    }

    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        logger.warn('Auth failed: token expired');
        throw new AppError('Session expired', 401);
      }

      if (err instanceof JsonWebTokenError) {
        logger.warn('Auth failed: invalid token');
        throw new AppError('Invalid token', 401);
      }

      throw err;
    }

    const user = await User.findById(payload.userId).select('-password');

    if (!user) {
      logger.warn('Auth failed: user not found', { userId: payload.userId });
      throw new AppError('Unauthorized', 401);
    }

    (req as any).user = user;

    logger.debug('Auth success', { userId: user._id });

    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err });
    next(err);
  }
}
