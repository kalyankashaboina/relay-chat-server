import crypto from 'crypto';

import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger';
import { emailService } from '../../shared/services/email.service';
import { AUTH, LIMITS } from '../../shared/constants';
import { signToken, signSocketToken } from '../../shared/utils/token';
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  type RegisterInput,
  type LoginInput,
  type GoogleAuthInput,
  type UpdateProfileInput,
} from '../../shared/validators';
import type { IUser } from '../users/user.model';
import { authRepository } from './repository/auth.repository';

const newPasswordSchema = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX, `Password must be at most ${LIMITS.PASSWORD_MAX} characters`);

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export function toSafeUser(user: IUser) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.username,
    avatar: user.avatar ?? '',
    bio: user.bio ?? '',
    isEmailVerified: user.isEmailVerified,
    provider: user.provider,
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(raw: RegisterInput) {
  const input = registerSchema.parse(raw);

  const existing = await authRepository.findByEmailOrUsername(input.email, input.username);
  if (existing) {
    if (existing.email === input.email.toLowerCase())
      throw new AppError('An account with this email already exists', 409);
    throw new AppError('Username is already taken', 409);
  }

  const hashedPassword = await bcrypt.hash(input.password, AUTH.BCRYPT_ROUNDS);
  const user = await authRepository.create({
    username: input.username,
    email: input.email,
    password: hashedPassword,
    provider: 'local',
    isEmailVerified: false,
  });

  emailService
    .sendWelcome(user.email, user.username)
    .catch((err: unknown) => logger.warn('Welcome email failed', { error: err }));

  logger.info('User registered', { userId: user._id });
  return { token: signToken(user._id.toString()), user: toSafeUser(user as IUser) };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(raw: LoginInput) {
  const input = loginSchema.parse(raw);
  const user = await authRepository.findByEmail(input.email);

  // Constant-time compare prevents user-enumeration via timing
  const dummyHash = '$2a$12$invalidhashfortimingonly.......................';
  const isValid = await bcrypt.compare(input.password, user?.password ?? dummyHash);

  if (!user || !isValid) throw new AppError('Invalid email or password', 401);

  if (user.provider === 'google' && !user.password)
    throw new AppError('This account uses Google sign-in. Please use the Google button.', 401);

  logger.info('Login successful', { userId: user._id });
  return { token: signToken(user._id.toString()), user: toSafeUser(user as unknown as IUser) };
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
// Accepts BOTH id_token (from credential flow) AND access_token (from implicit flow).
// id_token  → verified locally via google-auth-library (fast, offline)
// access_token → verified by calling Google's userinfo endpoint (requires network)

export async function googleAuth(raw: GoogleAuthInput) {
  const { idToken } = googleAuthSchema.parse(raw);

  if (!env.GOOGLE_CLIENT_ID)
    throw new AppError('Google login is not configured on this server', 503);

  const profile = await resolveGoogleProfile(idToken);
  const { sub: googleId, email, name, picture, email_verified } = profile;
  const normalizedEmail = email.toLowerCase();

  let user = await authRepository.findByEmail(normalizedEmail);

  if (user) {
    if (!user.googleId) {
      if (!email_verified) throw new AppError('Google email is not verified', 403);
      await authRepository.linkGoogle(user._id.toString(), googleId, picture);
      user = (await authRepository.findByEmail(normalizedEmail))!;
    }
  } else {
    const username = await findUniqueUsername(name ?? email.split('@')[0]);
    user = (await authRepository.create({
      email: normalizedEmail,
      username,
      avatar: picture ?? '',
      provider: 'google',
      googleId,
      isEmailVerified: !!email_verified,
    })) as unknown as Awaited<ReturnType<typeof authRepository.findByEmail>>;
    logger.info('New user via Google', { userId: (user as unknown as IUser)._id });
  }

  const userId = (user as unknown as IUser)._id.toString();
  return { token: signToken(userId), user: toSafeUser(user as unknown as IUser) };
}

async function resolveGoogleProfile(token: string): Promise<GoogleProfile> {
  // Heuristic: id_tokens are JWTs (3 dot-separated base64 segments)
  const isIdToken = token.split('.').length === 3;

  if (isIdToken && googleClient) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) throw new Error('Missing fields in id_token payload');
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        email_verified: payload.email_verified,
      };
    } catch (err) {
      logger.warn('id_token verification failed, falling back to userinfo', { err });
    }
  }

  // Access token path — call Google userinfo endpoint
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    logger.warn('Google userinfo endpoint returned error', { status: res.status });
    throw new AppError('Invalid Google token', 401);
  }

  const info = (await res.json()) as Partial<GoogleProfile>;
  if (!info.sub || !info.email)
    throw new AppError('Google profile is missing required fields', 400);

  return {
    sub: info.sub,
    email: info.email,
    name: info.name,
    picture: info.picture,
    email_verified: info.email_verified,
  };
}

// ── Forgot password ───────────────────────────────────────────────────────────

export async function forgotPassword(raw: { email: string }) {
  const { email } = forgotPasswordSchema.parse(raw);
  const user = await authRepository.findByEmail(email);
  if (!user || (user.provider === 'google' && !user.password)) return;

  const rawToken = crypto.randomBytes(AUTH.RESET_TOKEN_BYTES).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  await authRepository.updateById(user._id.toString(), {
    passwordResetToken: hashedToken,
    passwordResetExpires: Date.now() + AUTH.RESET_TTL_MS,
  });

  try {
    await emailService.sendPasswordReset(user.email, rawToken, user.username);
  } catch (err) {
    await authRepository.updateById(user._id.toString(), {
      passwordResetToken: undefined,
      passwordResetExpires: undefined,
    });
    logger.error('Reset email failed', { error: err });
    throw new AppError('Failed to send reset email. Try again later.', 500);
  }
}

// ── Reset password ────────────────────────────────────────────────────────────

export async function resetPassword(raw: { token: string; password: string }) {
  const { token, password } = resetPasswordSchema.parse(raw);
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await authRepository.findByResetToken(hashedToken);
  if (!user) throw new AppError('Reset token is invalid or has expired', 400);

  const hashedPassword = await bcrypt.hash(password, AUTH.BCRYPT_ROUNDS);
  await authRepository.updateById(user._id.toString(), {
    password: hashedPassword,
    passwordResetToken: undefined,
    passwordResetExpires: undefined,
    provider: 'local',
  });
}

// ── Update profile ────────────────────────────────────────────────────────────

export async function updateProfile(userId: string, raw: UpdateProfileInput) {
  const input = updateProfileSchema.parse(raw);

  if (input.username) {
    const taken = await authRepository.findByEmailOrUsername('', input.username);
    if (taken && taken._id.toString() !== userId) throw new AppError('Username already taken', 409);
  }

  const updates: Partial<IUser> = {};
  if (input.username !== undefined) updates.username = input.username;
  if (input.avatar !== undefined) updates.avatar = input.avatar;
  if (input.bio !== undefined) updates.bio = input.bio;

  const updated = await authRepository.updateById(userId, updates);
  if (!updated) throw new AppError('User not found', 404);
  return toSafeUser(updated as unknown as IUser);
}

// ── Change password ───────────────────────────────────────────────────────────

export async function changePassword(userId: string, newPassword: string) {
  const validPassword = newPasswordSchema.parse(newPassword);
  const hashedPassword = await bcrypt.hash(validPassword, AUTH.BCRYPT_ROUNDS);
  const user = await authRepository.updateById(userId, {
    password: hashedPassword,
    provider: 'local',
  });
  if (!user) throw new AppError('User not found', 404);
}

// ── Socket token ──────────────────────────────────────────────────────────────

export function createSocketToken(userId: string): string {
  return signSocketToken(userId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findUniqueUsername(base: string): Promise<string> {
  const sanitized =
    base
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 28) || 'user';

  const exists = await authRepository.findByEmailOrUsername('', sanitized);
  if (!exists) return sanitized;

  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${sanitized.slice(0, 24)}_${suffix}`;
}
