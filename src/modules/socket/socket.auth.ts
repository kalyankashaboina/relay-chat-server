// ─────────────────────────────────────────────────────────────────────────────
// socket/socket.auth.ts
// Socket.IO auth middleware — reads cookie from handshake headers.
// Token logic lives in shared/utils/token.ts — swap there to change strategy.
// ─────────────────────────────────────────────────────────────────────────────
import cookie from 'cookie';

import { AUTH } from '../../shared/constants';
import { logger } from '../../shared/utils/logger';
import { verifyToken } from '../../shared/utils/token';

import type { AuthenticatedSocket } from './socket.types';

export function socketAuth(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
  try {
    const rawCookie = socket.request.headers.cookie;

    if (!rawCookie) {
      logger.warn('[SOCKET_AUTH] No cookie header', { socketId: socket.id });
      next(new Error('Authentication required'));
      return;
    }

    const cookies = cookie.parse(rawCookie);
    const token = cookies[AUTH.COOKIE_NAME];

    if (!token) {
      logger.warn('[SOCKET_AUTH] Cookie missing relay_token', { socketId: socket.id });
      next(new Error('Authentication required'));
      return;
    }

    const payload = verifyToken(token);
    socket.data.userId = payload.userId;

    logger.debug('[SOCKET_AUTH] Authenticated', { socketId: socket.id, userId: payload.userId });
    next();
  } catch (err) {
    logger.error('[SOCKET_AUTH] Error', { error: (err as Error).message });
    next(new Error('Invalid token'));
  }
}
