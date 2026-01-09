import type { Request, Response, NextFunction } from 'express';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { User } from '../users/user.model';
import { AppError } from '../../shared/errors/AppError';

interface JwtPayload {
  userId: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.relay_token;

    if (!token) {
      throw new AppError('Unauthorized', 401);
    }

    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new AppError('Session expired', 401);
      }

      if (err instanceof JsonWebTokenError) {
        throw new AppError('Invalid token', 401);
      }

      throw err; // unknown error
    }

    const user = await User.findById(payload.userId).select('-password');

    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    // Attach authenticated user to request
    (req as any).user = user;

    next();
  } catch (err) {
    next(err);
  }
}
