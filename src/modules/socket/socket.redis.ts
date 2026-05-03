import type { Server } from 'socket.io';
import { redisSub } from '../../config/redis';
import { logger } from '../../shared/logger';

export function setupRedisSubscriptions(io: Server): void {
  redisSub.subscribe('message:confirmed', 'message:failed', (err) => {
    if (err) logger.error('[REDIS SUB] Subscribe error', { error: err.message });
    else logger.info('[REDIS SUB] Subscribed to message:confirmed, message:failed');
  });

  redisSub.on('message', (channel: string, raw: string) => {
    try {
      const data = JSON.parse(raw);
      logger.info('[REDIS SUB] Received', { channel, data });

      if (channel === 'message:confirmed') {
        io.to(data.conversationId).emit('message:confirmed', {
          tempId: data.tempId,
          realId: data.realId,
          conversationId: data.conversationId,
          createdAt: data.createdAt,
        });
        logger.info('[REDIS SUB] Emitted message:confirmed to room', {
          conversationId: data.conversationId,
          tempId: data.tempId,
        });
      }

      if (channel === 'message:failed') {
        io.to(data.conversationId).emit('message:failed', {
          tempId: data.tempId,
          conversationId: data.conversationId,
        });
        logger.info('[REDIS SUB] Emitted message:failed to room', {
          conversationId: data.conversationId,
          tempId: data.tempId,
        });
      }
    } catch (err) {
      logger.error('[REDIS SUB] Failed to parse message', { channel, raw, error: err });
    }
  });
}
