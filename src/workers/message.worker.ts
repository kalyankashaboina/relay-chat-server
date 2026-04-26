import { messageQueue, conversationQueue, readReceiptQueue } from '../queues/message.queue';
import { Message } from '../modules/messages/message.model';
import { Conversation } from '../modules/conversations/conversation.model';
import { redisPub } from '../config/redis';
import { logger } from '../shared/utils/logger';

const WORKER_KEY = '__MESSAGE_WORKER_INITIALIZED__';

if ((global as any)[WORKER_KEY]) {
  logger.warn(' Worker already initialized — skipping duplicate registration');
} else {
  (global as any)[WORKER_KEY] = true;

  logger.info(' Initializing worker processors...');

  // ================================
  // MESSAGE PROCESSOR
  // ================================
  messageQueue.process(5, async (job) => {
    logger.info(' Processing message job', { id: job.id });

    const { conversationId, senderId, content, tempId } = job.data;

    try {
      const message = await Message.create({
        conversationId,
        senderId,
        content,
      });

      logger.info(' Message saved', { id: message._id });

      await redisPub.publish(
        'message:confirmed',
        JSON.stringify({
          tempId,
          realId: message._id.toString(),
          conversationId,
          createdAt: message.createdAt,
        })
      );

      await conversationQueue.add({
        conversationId,
        lastMessage: message._id,
        lastMessageAt: message.createdAt,
      });

      return true;
    } catch (err) {
      logger.error(' Message save failed', { err, jobId: job.id });

      await redisPub.publish('message:failed', JSON.stringify({ tempId, conversationId }));

      throw err;
    }
  });

  // ================================
  // CONVERSATION PROCESSOR
  // ================================
  conversationQueue.process(5, async (job) => {
    logger.info('📦 Processing conversation job', { id: job.id });

    const { conversationId, lastMessage, lastMessageAt } = job.data;

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage,
      lastMessageAt,
      $inc: { messageCount: 1 },
    });
  });

  // ================================
  // READ RECEIPT PROCESSOR
  // ================================
  readReceiptQueue.process(5, async (job) => {
    logger.info(' Processing read receipt job', { id: job.id });

    const { conversationId, userId, messageIds } = job.data;

    await Message.updateMany(
      {
        _id: { $in: messageIds },
        conversationId,
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
        $set: { status: 'read' },
      }
    );
  });

  // ================================
  // GLOBAL ERROR LISTENER
  // ================================
  messageQueue.on('failed', (job, err) => {
    logger.error(' Job failed', { id: job?.id, err });
  });

  logger.info('✅ Worker processors registered successfully');
}
