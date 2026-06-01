import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';

import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { AUTH } from '../../shared/constants';
import { User } from '../users/user.model';

import * as authService from './auth.service';

const isProd = env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
  maxAge: AUTH.COOKIE_MAX_AGE_MS,
  path: '/',
} as const;

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH.COOKIE_NAME, token, cookieOptions);
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH.COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
  });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(
      req.body as Parameters<typeof authService.register>[0]
    );
    setAuthCookie(res, result.token);
    res.status(201).json({ success: true, data: result.user });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body as Parameters<typeof authService.login>[0]);
    setAuthCookie(res, result.token);
    res.status(200).json({ success: true, data: result.user });
  } catch (err) {
    next(err);
  }
}

export async function googleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.googleAuth(
      req.body as Parameters<typeof authService.googleAuth>[0]
    );
    setAuthCookie(res, result.token);
    res.status(200).json({ success: true, data: result.user });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(200).json({ success: true, message: 'Logged out' });
}

export async function me(req: Request, res: Response) {
  const u = req.user!;
  res.status(200).json({
    success: true,
    data: {
      id: u._id,
      email: u.email,
      name: u.username,
      avatar: u.avatar ?? '',
      bio: (u.bio as string | undefined) ?? '',
      isEmailVerified: u.isEmailVerified,
      provider: u.provider,
    },
  });
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.forgotPassword(req.body as { email: string });
    res
      .status(200)
      .json({ success: true, message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.resetPassword(req.body as { token: string; password: string });
    res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await authService.updateProfile(
      req.user!._id,
      req.body as Parameters<typeof authService.updateProfile>[1]
    );
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// changePasswordSchema: { currentPassword, newPassword }
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword)
      return next(new AppError('currentPassword and newPassword are required', 400));

    // Verify current password against DB
    const user = await User.findById(req.user!._id).select('password provider');
    if (!user) return next(new AppError('User not found', 404));
    if (user.provider === 'google' && !user.password)
      return next(new AppError('Google accounts must set a password via reset-password', 400));

    const valid = await bcrypt.compare(currentPassword, user.password ?? '');
    if (!valid) return next(new AppError('Current password is incorrect', 401));

    await authService.changePassword(req.user!._id, newPassword);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

export async function socketToken(req: Request, res: Response) {
  const token = authService.createSocketToken(req.user!._id);
  res.status(200).json({ success: true, token });
}
