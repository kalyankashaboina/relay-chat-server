import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { RATE_LIMITS } from '../../shared/constants';
import { validate } from '../../shared/middleware/validate';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from '../../shared/validators';

import {
  register,
  login,
  googleLogin,
  logout,
  me,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  socketToken,
} from './auth.controller';
import { requireAuth } from './auth.middleware';

const router = Router();

// Rate limiters — applied BEFORE validation to block abuse early
const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH_WINDOW_MS,
  max: RATE_LIMITS.AUTH_MAX,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const forgotLimiter = rateLimit({
  windowMs: RATE_LIMITS.FORGOT_WINDOW_MS,
  max: RATE_LIMITS.FORGOT_MAX,
  message: { success: false, message: 'Too many password reset requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public — rate limit first, then validate body
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/google', authLimiter, googleLogin);
router.post('/logout', logout);
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);

// Protected
router.get('/me', requireAuth, me);
router.put('/me', requireAuth, validate(updateProfileSchema), updateProfile);
router.post('/change-password', requireAuth, validate(changePasswordSchema), changePassword);
router.get('/socket-token', requireAuth, socketToken);

export default router;
