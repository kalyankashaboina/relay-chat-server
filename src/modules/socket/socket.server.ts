import type http from 'http';
import { Server } from 'socket.io';
import { env } from '../../config/env';

export function createSocketServer(httpServer: http.Server) {
  return new Server(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });
}
