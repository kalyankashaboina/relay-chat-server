import { Server } from 'socket.io';

import { env } from '../../config/env';

export function createSocketServer(httpServer: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    transports: ['websocket'],
  });

  return io;
}
