import { messageQueue, conversationQueue, readReceiptQueue } from '../queues/message.queue';
import { Message } from '../modules/messages/message.model';
import { Conversation } from '../modules/conversations/conversation.model';
import { redisPub } from '../config/redis';
import { logger } from '../shared/utils/logger';

// ================================
// MESSAGE PROCESSOR
// ================================

messageQueue.process(async (job) => {
  const { conversationId, senderId, content, tempId } = job.data;

  try {
    const message = await Message.create({
      conversationId,
      senderId,
      content,
    });

    logger.info('Message saved', { id: message._id });

    // 🔥 Publish success
    await redisPub.publish(
      'message:confirmed',
      JSON.stringify({
        tempId,
        realId: message._id.toString(),
        conversationId,
        createdAt: message.createdAt,
      })
    );

    // Update conversation
    await conversationQueue.add({
      conversationId,
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
    });

    return true;
  } catch (err) {
    logger.error('Message save failed', err);

    // 🔥 Publish failure
    await redisPub.publish(
      'message:failed',
      JSON.stringify({ tempId, conversationId })
    );

    throw err;
  }
});

// ================================
// CONVERSATION PROCESSOR
// ================================

conversationQueue.process(async (job) => {
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

readReceiptQueue.process(async (job) => {
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