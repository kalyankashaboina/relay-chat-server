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
// NOTE: Processors are defined in workers/message.processor.ts
// This file ONLY defines queues and queue operations
// Do NOT add .process() calls here - causes duplicate registration
// ================================

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
