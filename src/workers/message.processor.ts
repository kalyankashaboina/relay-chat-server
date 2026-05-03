/**
 * Message Queue Processor
 *
 * This file contains ALL queue processor registrations.
 * It is ONLY imported by worker.ts (the worker entry point).
 *
 * CRITICAL: This function must be called exactly ONCE per worker process,
 * and ONLY from the worker entry point (worker.ts).
 */

import { Job } from 'bull';
import { messageQueue, conversationQueue, readReceiptQueue } from '../queues/message.queue';
import { Message } from '../modules/messages/message.model';
import { Conversation } from '../modules/conversations/conversation.model';
import { redisPub } from '../config/redis';
import { logger } from '../shared/utils/logger';

// ================================
// TYPE DEFINITIONS
// ================================

interface SaveMessageJobData {
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  tempId: string;
  attachments?: unknown[];
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
// PROCESSOR REGISTRATION
// ================================

/**
 * Register all queue processors.
 * Must be called exactly once per worker process.
 * Called from worker.ts entry point.
 */
export function registerProcessors() {
  logger.info('🔧 Registering queue processors...');

  // ================================
  // MESSAGE PROCESSOR
  // ================================
  messageQueue.process(5, async (job: Job<SaveMessageJobData>) => {
    const { conversationId, senderId, content, type, tempId, attachments } = job.data;

    logger.info('📬 Processing message job', { jobId: job.id, tempId });

    try {
      const message = await (Message.create as unknown)({
        conversationId,
        senderId,
        content,
        type,
        attachments: attachments || [],
        deliveredTo: [],
        readBy: [],
      });

      logger.info('✅ Message saved to DB', { messageId: message._id, tempId });

      // Publish confirmed event to Redis
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
      logger.error('❌ Message save failed', { error, jobId: job.id, tempId });

      // Publish failure event
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
  conversationQueue.process(5, async (job: Job<UpdateConversationJobData>) => {
    const { conversationId, lastMessage, lastMessageAt } = job.data;

    logger.info('📦 Processing conversation job', { jobId: job.id, conversationId });

    try {
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage,
        lastMessageAt,
        $inc: { messageCount: 1 },
      });

      logger.info('✅ Conversation updated', { conversationId });
    } catch (error) {
      logger.error('❌ Conversation update failed', { error, jobId: job.id, conversationId });
      throw error;
    }
  });

  // ================================
  // READ RECEIPT PROCESSOR
  // ================================
  readReceiptQueue.process(5, async (job: Job<ReadReceiptJobData>) => {
    const { conversationId, userId, messageIds } = job.data;

    logger.info('📖 Processing read receipt job', {
      jobId: job.id,
      conversationId,
      userId,
      count: messageIds.length,
    });

    try {
      const result = await Message.updateMany(
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

      logger.info('✅ Read receipts processed', {
        conversationId,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      logger.error('❌ Read receipt processing failed', { error, jobId: job.id, conversationId });
      throw error;
    }
  });

  // ================================
  // GLOBAL ERROR HANDLERS
  // ================================

  messageQueue.on('completed', (job) => {
    logger.info('✅ Message job completed', { jobId: job.id });
  });

  messageQueue.on('failed', (job, err) => {
    logger.error('❌ Message job failed', { jobId: job?.id, error: err });
  });

  messageQueue.on('stalled', (job) => {
    logger.warn('⚠️  Message job stalled', { jobId: job.id });
  });

  conversationQueue.on('failed', (job, err) => {
    logger.error('❌ Conversation job failed', { jobId: job?.id, error: err });
  });

  readReceiptQueue.on('failed', (job, err) => {
    logger.error('❌ Read receipt job failed', { jobId: job?.id, error: err });
  });

  logger.info('✅ All queue processors registered successfully');
}
