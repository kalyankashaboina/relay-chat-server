import { redisSub } from '../config/redis';
import { Server } from 'socket.io';

export function startRedisSubscriber(io: Server) {
  redisSub.subscribe('message:confirmed');
  redisSub.subscribe('message:failed');

  redisSub.on('message', (channel, message) => {
    const data = JSON.parse(message);

    if (channel === 'message:confirmed') {
      io.to(data.conversationId).emit('MSG_CONFIRMED', data);
    }

    if (channel === 'message:failed') {
      io.to(data.conversationId).emit('MSG_FAILED', data);
    }
  });
}
