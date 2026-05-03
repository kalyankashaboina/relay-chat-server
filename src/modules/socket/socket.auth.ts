import cookie from 'cookie';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { logger } from '../../shared/utils/logger';

import type { AuthenticatedSocket } from './socket.types';

export function socketAuth(socket: AuthenticatedSocket, next: (err?: Error) => void) {
  try {
    logger.info('[SOCKET_AUTH] Authentication middleware invoked', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    const rawCookie = socket.request.headers.cookie;

    logger.info('[SOCKET_AUTH] Cookie header status', {
      socketId: socket.id,
      hasCookie: !!rawCookie,
      cookieHeaderLength: rawCookie?.length ?? 0,
      cookieHeaderPreview: rawCookie?.substring(0, 100) ?? 'NO_COOKIE',
    });

    if (!rawCookie) {
      logger.warn('[SOCKET_AUTH] Authentication failed - no cookie header', {
        socketId: socket.id,
        requestHeaders: Object.keys(socket.request.headers),
        reason: 'Missing cookie header in request',
      });
      return next(new Error('Authentication required'));
    }

    const cookies = cookie.parse(rawCookie);

    logger.debug('[SOCKET_AUTH] Parsed cookies', {
      socketId: socket.id,
      cookieCount: Object.keys(cookies).length,
      cookieNames: Object.keys(cookies),
    });

    const token = cookies.relay_token;

    logger.info('[SOCKET_AUTH] Token extraction', {
      socketId: socket.id,
      hasToken: !!token,
      tokenLength: token?.length ?? 0,
      tokenPreview: token ? `${token.substring(0, 20)}...${token.substring(token.length - 20)}` : 'NO_TOKEN',
    });

    if (!token) {
      logger.warn('[SOCKET_AUTH] Authentication failed - relay_token not found in cookies', {
        socketId: socket.id,
        availableCookies: Object.keys(cookies),
        reason: 'Missing relay_token cookie',
      });
      return next(new Error('Authentication required'));
    }

    logger.debug('[SOCKET_AUTH] Attempting JWT verification', {
      socketId: socket.id,
      jwtSecretLength: env.JWT_SECRET?.length ?? 0,
    });

    const payload = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
    };

    logger.info('[SOCKET_AUTH] JWT verified successfully', {
      socketId: socket.id,
      userId: payload.userId,
      timestamp: new Date().toISOString(),
    });

    // OK - correct place
    socket.data.userId = payload.userId;

    logger.info('[SOCKET_AUTH] Socket data updated with userId', {
      socketId: socket.id,
      userId: socket.data.userId,
    });

    logger.info('[SOCKET_AUTH] Authentication successful', {
      socketId: socket.id,
      userId: payload.userId,
      status: 'AUTHENTICATED',
    });

    next();
  } catch (err) {
    const error = err as Error;
    logger.error('[SOCKET_AUTH] Authentication error', {
      socketId: socket.id,
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
    });
    next(new Error('Invalid token'));
  }
}
