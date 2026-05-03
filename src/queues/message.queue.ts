import Bull, { Queue } from 'bull';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

const redisUrl = new URL(env.REDIS_URL);

const redisOpts = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379'),
  password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
  tls: env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

logger.info('[QUEUE] Initialising Bull queues', {
  host: redisOpts.host,
  port: redisOpts.port,
  hasTLS: !!redisOpts.tls,
  hasPassword: !!redisOpts.password,
});

export const messageQueue: Queue = new Bull('message-processing', { redis: redisOpts });
export const conversationQueue: Queue = new Bull('conversation-updates', { redis: redisOpts });
export const readReceiptQueue: Queue = new Bull('read-receipts', { redis: redisOpts });

messageQueue.on('error', (err) =>
  logger.error('[QUEUE] messageQueue error', { error: err.message })
);
conversationQueue.on('error', (err) =>
  logger.error('[QUEUE] conversationQueue error', { error: err.message })
);
readReceiptQueue.on('error', (err) =>
  logger.error('[QUEUE] readReceiptQueue error', { error: err.message })
);

messageQueue.on('ready', () => logger.info('[QUEUE] messageQueue ready'));
conversationQueue.on('ready', () => logger.info('[QUEUE] conversationQueue ready'));
readReceiptQueue.on('ready', () => logger.info('[QUEUE] readReceiptQueue ready'));

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
// HELPERS
// ================================

export async function queueMessageSave(data: SaveMessageJobData): Promise<void> {
  logger.info('[QUEUE] Adding message job', {
    tempId: data.tempId,
    conversationId: data.conversationId,
  });
  try {
    const job = await messageQueue.add(data, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    logger.info('[QUEUE] Message job added', { jobId: job.id, tempId: data.tempId });
  } catch (err: any) {
    logger.error('[QUEUE] Failed to add message job', { error: err.message, tempId: data.tempId });
    throw err;
  }
}

export async function queueConversationUpdate(data: UpdateConversationJobData): Promise<void> {
  logger.info('[QUEUE] Adding conversation update job', { conversationId: data.conversationId });
  try {
    await conversationQueue.add(data, { priority: 2 });
    logger.info('[QUEUE] Conversation update job added', { conversationId: data.conversationId });
  } catch (err: any) {
    logger.error('[QUEUE] Failed to add conversation update job', { error: err.message });
    throw err;
  }
}

export async function queueReadReceipts(data: ReadReceiptJobData): Promise<void> {
  logger.info('[QUEUE] Adding read receipts job', {
    conversationId: data.conversationId,
    count: data.messageIds.length,
  });
  try {
    await readReceiptQueue.add(data, { priority: 3 });
    logger.info('[QUEUE] Read receipts job added', { conversationId: data.conversationId });
  } catch (err: any) {
    logger.error('[QUEUE] Failed to add read receipts job', { error: err.message });
    throw err;
  }
}

// ================================
// SHUTDOWN
// ================================

export async function closeQueues(): Promise<void> {
  logger.info('[QUEUE] Closing all queues...');
  await messageQueue.close();
  await conversationQueue.close();
  await readReceiptQueue.close();
  logger.info('[QUEUE] All queues closed');
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
