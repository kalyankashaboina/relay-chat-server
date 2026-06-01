// ─────────────────────────────────────────────────────────────────────────────
// shared/utils/token.ts
// Centralised token utilities — swap here to change auth strategy globally.
// Used by: auth.service, auth.middleware, socket.auth
// ─────────────────────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AUTH } from '../constants';

interface JwtPayload {
  userId: string;
}

/** Sign a JWT for a given userId */
export function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: AUTH.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Sign a short-lived token for socket handshake */
export function signSocketToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '1h' });
}

/** Verify a JWT — throws on failure */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
