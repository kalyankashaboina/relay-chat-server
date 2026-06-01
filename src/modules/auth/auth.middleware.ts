import type { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { User } from '../users/user.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { AUTH } from '../../shared/constants';
import { verifyToken } from '../../shared/utils/token';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        _id: string;
        username: string;
        email: string;
        avatar?: string;
        [key: string]: unknown;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH.COOKIE_NAME] as string | undefined;
    if (!token) return next(new AppError('Authentication required', 401));

    let payload: { userId: string };
    try {
      payload = verifyToken(token);
    } catch (err) {
      if (err instanceof TokenExpiredError)
        return next(new AppError('Session expired. Please log in again.', 401));
      if (err instanceof JsonWebTokenError)
        return next(new AppError('Invalid session. Please log in again.', 401));
      throw err;
    }

    const user = await User.findById(payload.userId).select(
      '-password -passwordResetToken -passwordResetExpires'
    );

    if (!user) return next(new AppError('User account not found', 401));

    const userObj = user.toObject();
    req.user = {
      ...userObj,
      _id: user._id.toString(),
      userId: user._id.toString(),
    } as Request['user'];

    logger.debug('Auth success', { userId: user._id });
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: (err as Error).message });
    next(err);
  }
}
