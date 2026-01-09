import type { Request, Response, NextFunction } from 'express';

import { AppError } from '../../shared/errors/AppError';

import * as authService from './auth.service';

/* ===============================
   Register
================================ */

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      throw new AppError('Username, email and password are required', 400);
    }

    email = email.trim().toLowerCase();

    await authService.register(username, email, password);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    next(err);
  }
}

/* ===============================
   Login
================================ */

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    email = email.trim().toLowerCase();

    const token = await authService.login(email, password);

    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('relay_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ message: 'Login successful' });
  } catch (err) {
    next(err);
  }
}

/* ===============================
   Logout
================================ */

export async function logout(req: Request, res: Response) {
  const isProd = process.env.NODE_ENV === 'production';

  res.clearCookie('relay_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });

  res.status(200).json({ message: 'Logged out successfully' });
}

/* ===============================
   Me
================================ */

export async function me(req: Request, res: Response) {
  res.status(200).json((req as any).user);
}

/* ===============================
   Forgot Password
================================ */

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    await authService.forgotPassword(email.toLowerCase());

    // Always success (security)
    res.status(200).json({
      message: 'If the email exists, a reset link has been sent',
    });
  } catch (err) {
    next(err);
  }
}

/* ===============================
   Reset Password
================================ */

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError('Token and password are required', 400);
    }

    await authService.resetPassword(token, password);

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
}
