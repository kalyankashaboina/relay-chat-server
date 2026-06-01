import type { Server } from 'socket.io';
import { Types } from 'mongoose';
import { Message } from '../modules/messages/message.model';
import { conversationRepository } from '../modules/conversations/repository/conversation.repository';
import { SOCKET_EVENTS } from '../shared/constants';
import { logger } from '../shared/logger';

const POLL_INTERVAL_MS = 30_000;

export function startScheduledMessageJob(io: Server): void {
  setInterval(() => dispatchDueMessages(io), POLL_INTERVAL_MS);
  logger.info('Scheduled message job started', { intervalMs: POLL_INTERVAL_MS });
}

async function dispatchDueMessages(io: Server): Promise<void> {
  try {
    const due = await Message.find({
      isScheduled: true,
      isDeleted: false,
      scheduledAt: { $lte: new Date() },
    })
      .select('_id conversationId senderId content type attachments')
      .lean();

    if (!due.length) return;

    for (const msg of due) {
      await sendScheduledMessage(io, msg);
    }

    logger.info('Dispatched scheduled messages', { count: due.length });
  } catch (err) {
    logger.error('Scheduled message dispatch failed', { error: err });
  }
}

interface ScheduledMsgDoc {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  content?: string;
  type?: string;
  attachments?: unknown[];
}

async function sendScheduledMessage(io: Server, msg: ScheduledMsgDoc): Promise<void> {
  const msgId = msg._id.toString();
  const convId = msg.conversationId.toString();

  await Message.findByIdAndUpdate(msgId, {
    isScheduled: false,
    $unset: { scheduledAt: '' },
  });

  await conversationRepository.updateLastMessage(convId, msg._id);

  io.to(convId).emit(SOCKET_EVENTS.MSG_NEW, {
    id: msgId,
    conversationId: convId,
    senderId: msg.senderId.toString(),
    content: msg.content ?? '',
    type: msg.type ?? 'text',
    attachments: msg.attachments ?? [],
    createdAt: new Date().toISOString(),
    status: 'sent',
  });
}
