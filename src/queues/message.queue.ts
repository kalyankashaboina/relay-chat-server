import Bull, { Queue, Job } from 'bull';
import { logger } from '../shared/utils/logger';
import { Message } from '../modules/messages/message.model';
import { Conversation } from '../modules/conversations/conversation.model';
import { env } from '../config/env';
import { redisPub } from '../config/redis';

const REDIS_URL = env.REDIS_URL;

export const messageQueue: Queue = new Bull('message-processing', REDIS_URL);

export const conversationQueue: Queue = new Bull('conversation-updates', REDIS_URL);

export const readReceiptQueue: Queue = new Bull('read-receipts', REDIS_URL);

// ================================
// TYPES
// ================================

interface SaveMessageJobData {
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  tempId: string;
  attachments?: any[];
  replyTo?: string;
}

interface UpdateConversationJobData {
  conversationId: string;
  lastMessage: string;
  lastMessageAt: Date;
}

interface ReadReceiptJobData {
  conversationId: string;
  userId: string;
  messageIds: string[];
}

// ================================
// PROCESSORS (WORKER SAFE)
// ================================

messageQueue.process(async (job: Job<SaveMessageJobData>) => {
  const { conversationId, senderId, content, type, tempId, attachments, replyTo } = job.data;

  logger.info(`Processing message save: ${tempId}`);

  try {
    const message = await (Message.create as any)({
      conversationId,
      senderId,
      content,
      type,
      attachments: attachments || [],
      deliveredTo: [],
      readBy: [],
    });

    logger.info('Message saved to DB', { messageId: message._id });

    // ✅ Publish event instead of using socket directly
    await redisPub.publish(
      'message:confirmed',
      JSON.stringify({
        tempId,
        realId: message._id.toString(),
        conversationId,
        createdAt: message.createdAt,
      })
    );

    // Queue conversation update
    await conversationQueue.add({
      conversationId,
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
    });

    return {
      messageId: message._id.toString(),
      tempId,
      createdAt: message.createdAt,
    };
  } catch (error) {
    logger.error('Failed to save message:', error);

    // ✅ Publish failure
    await redisPub.publish(
      'message:failed',
      JSON.stringify({
        tempId,
        conversationId,
      })
    );

    throw error;
  }
});

// ================================
// CONVERSATION PROCESSOR
// ================================

conversationQueue.process(async (job: Job<UpdateConversationJobData>) => {
  const { conversationId, lastMessage, lastMessageAt } = job.data;

  try {
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage,
      lastMessageAt,
      $inc: { messageCount: 1 },
    });

    logger.info(`Conversation updated: ${conversationId}`);
  } catch (error) {
    logger.error('Failed to update conversation:', error);
    throw error;
  }
});

// ================================
// READ RECEIPT PROCESSOR
// ================================

readReceiptQueue.process(async (job: Job<ReadReceiptJobData>) => {
  const { conversationId, userId, messageIds } = job.data;

  try {
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

    logger.info(`Read receipts processed: ${messageIds.length}`);
  } catch (error) {
    logger.error('Failed to process read receipts:', error);
    throw error;
  }
});

// ================================
// EVENTS
// ================================

messageQueue.on('completed', (job) => {
  logger.info(`Message job completed: ${job.id}`);
});

messageQueue.on('failed', (job, err) => {
  logger.error(`Message job failed: ${job?.id}`, err);
});

messageQueue.on('stalled', (job) => {
  logger.warn(`Message job stalled: ${job.id}`);
});

// ================================
// HELPERS
// ================================

export async function queueMessageSave(data: SaveMessageJobData): Promise<void> {
  await messageQueue.add(data, {
    priority: 1,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function queueConversationUpdate(data: UpdateConversationJobData): Promise<void> {
  await conversationQueue.add(data, { priority: 2 });
}

export async function queueReadReceipts(data: ReadReceiptJobData): Promise<void> {
  await readReceiptQueue.add(data, { priority: 3 });
}

// ================================
// SHUTDOWN
// ================================

export async function closeQueues(): Promise<void> {
  await messageQueue.close();
  await conversationQueue.close();
  await readReceiptQueue.close();
  logger.info('All queues closed');
}

export default {
  messageQueue,
  conversationQueue,
  readReceiptQueue,
  queueMessageSave,
  queueConversationUpdate,
  queueReadReceipts,
  closeQueues,
};
