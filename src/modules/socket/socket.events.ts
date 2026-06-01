// ─────────────────────────────────────────────────────────────────────────────
// socket/socket.events.ts
// All Socket.IO event handlers. No Redis, no Bull queues.
// In-memory presence/typing maps — sufficient for a single-instance deployment.
// ─────────────────────────────────────────────────────────────────────────────
import type { Server } from 'socket.io';

import { User } from '../users/user.model';
import { Conversation } from '../conversations/conversation.model';
import { Message } from '../messages/message.model';
import { createMessage } from '../messages/message.service';
import { SOCKET_EVENTS, SOCKET } from '../../shared/constants';
import { logger } from '../../shared/logger';
import { SocketIdempotency } from '../../shared/middleware/idempotency';

import type {
  AuthenticatedSocket,
  SendMessagePayload,
  DeleteMessagePayload,
  TypingPayload,
  ReadConversationPayload,
  CallInitiatePayload,
} from './socket.types';

// ── In-process state ──────────────────────────────────────────────────────────

const onlineUsers = new Set<string>();
const activeCalls = new Map<string, string>(); // userId → peerId
const typingTimeouts = new Map<string, NodeJS.Timeout>(); // `${userId}:${convId}` → timer

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertMember(conversationId: string, userId: string): Promise<void> {
  const convo = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  }).select('_id');
  if (!convo) throw new Error('FORBIDDEN');
}

function safeAsync(fn: () => Promise<void>): void {
  fn().catch((err) => logger.error('[SOCKET] Async error', { error: (err as Error).message }));
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerSocketEvents(io: Server): void {
  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;

    if (!userId) {
      logger.warn('[SOCKET] No userId — disconnecting', { socketId: socket.id });
      socket.disconnect(true);
      return;
    }

    const userDoc = await User.findById(userId).select('username').lean();
    if (!userDoc) {
      logger.warn('[SOCKET] User not found — disconnecting', { socketId: socket.id, userId });
      socket.disconnect(true);
      return;
    }

    const username = (userDoc as unknown as { username: string }).username;

    // Personal room + presence
    socket.join(userId);
    onlineUsers.add(userId);
    io.emit(SOCKET_EVENTS.USER_ONLINE, { userId });
    socket.emit(SOCKET_EVENTS.PRESENCE_INIT, { onlineUsers: Array.from(onlineUsers) });

    // Join all conversation rooms
    const conversations = await Conversation.find({ participants: userId }).select('_id').lean();
    conversations.forEach((c) => socket.join(c._id.toString()));

    logger.info('[SOCKET] Connected', { socketId: socket.id, userId, username });

    // ── message:send ──────────────────────────────────────────────────────────

    socket.on(SOCKET_EVENTS.MSG_SEND, (payload: SendMessagePayload & { replyTo?: unknown }) => {
      const { conversationId, content, tempId, replyTo } = payload;
      logger.info('[SOCKET] MSG_SEND received', { payload });
      safeAsync(async () => {
        if (!conversationId || !content?.trim()) {
          socket.emit(SOCKET_EVENTS.MSG_FAILED, {
            tempId,
            conversationId,
            reason: 'INVALID_PAYLOAD',
          });
          return;
        }

        if (tempId && SocketIdempotency.checkAndMark(tempId)) return; // duplicate

        try {
          await assertMember(conversationId, userId);
        } catch {
          socket.emit(SOCKET_EVENTS.MSG_FAILED, {
            tempId,
            conversationId,
            reason: 'FORBIDDEN',
          });
          return;
        }

        const finalTempId = tempId || `temp-${Date.now()}-${Math.random()}`;

        let savedMsg: Awaited<ReturnType<typeof createMessage>>;
        try {
          savedMsg = await createMessage({
            conversationId,
            senderId: userId,
            content: content.trim(),
            type: 'text',
            attachments: [],
            replyTo: replyTo as Parameters<typeof createMessage>[0]['replyTo'],
          });
        } catch (err) {
          logger.error('[SOCKET] MSG_SEND DB error', {
            error: (err as Error).message,
          });
          socket.emit(SOCKET_EVENTS.MSG_FAILED, {
            tempId: finalTempId,
            conversationId,
            reason: 'DB_ERROR',
          });
          return;
        }

        const savedId = (savedMsg as unknown as { _id: { toString(): string } })._id.toString();
        const createdAt = (savedMsg as unknown as { createdAt: Date }).createdAt;

        const msgData = {
          id: savedId,
          tempId: finalTempId,
          conversationId,
          senderId: userId,
          content: content.trim(),
          createdAt,
          replyTo: replyTo ?? null,
          sender: { _id: userId, username },
          status: 'sent',
        };

        io.to(conversationId).emit(SOCKET_EVENTS.MSG_NEW, {
          ...msgData,
          createdAt:
            msgData.createdAt instanceof Date ? msgData.createdAt.toISOString() : msgData.createdAt,
        });
        socket.emit(SOCKET_EVENTS.MSG_SENT, {
          tempId: finalTempId,
          messageId: savedId,
          conversationId,
          createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
        });
        io.to(conversationId).except(socket.id).emit(SOCKET_EVENTS.MSG_DELIVERED, {
          messageId: savedId,
          conversationId,
        });
      });
    });

    // ── message:delete ────────────────────────────────────────────────────────

    socket.on(SOCKET_EVENTS.MSG_DELETE, ({ messageId }: DeleteMessagePayload) => {
      safeAsync(async () => {
        const msg = await Message.findOne({
          _id: messageId,
          senderId: userId,
          isDeleted: false,
        });
        if (!msg) return;
        await assertMember(msg.conversationId.toString(), userId);
        msg.isDeleted = true;
        msg.deletedAt = new Date();
        await msg.save();
        io.to(msg.conversationId.toString()).emit(SOCKET_EVENTS.MSG_DELETED, {
          messageId,
          conversationId: msg.conversationId.toString(),
        });
      });
    });

    // ── message:edit ──────────────────────────────────────────────────────────

    socket.on(
      SOCKET_EVENTS.MSG_EDIT,
      ({ messageId, content }: { messageId: string; content: string }) => {
        safeAsync(async () => {
          if (!content?.trim()) return;
          const msg = await Message.findOne({
            _id: messageId,
            senderId: userId,
            isDeleted: false,
          });
          if (!msg) return;
          await assertMember(msg.conversationId.toString(), userId);
          msg.content = content.trim();
          msg.isEdited = true;
          msg.editedAt = new Date();
          await msg.save();
          io.to(msg.conversationId.toString()).emit(SOCKET_EVENTS.MSG_EDITED, {
            messageId,
            content: msg.content,
            conversationId: msg.conversationId.toString(),
            editedAt: (msg.editedAt as Date).toISOString(),
          });
        });
      }
    );

    // ── message:react ─────────────────────────────────────────────────────────

    socket.on(
      SOCKET_EVENTS.MSG_REACT,
      ({
        messageId,
        emoji,
        conversationId,
      }: {
        messageId: string;
        emoji: string;
        conversationId: string;
      }) => {
        safeAsync(async () => {
          await assertMember(conversationId, userId);
          const msg = await Message.findById(messageId);
          if (!msg || msg.isDeleted) return;

          // Check for existing reaction with same emoji from same user
          const already = msg.reactions.some(
            (r) => r.userId.toString() === userId && r.emoji === emoji
          );
          if (already) return;

          await Message.findByIdAndUpdate(messageId, {
            $push: {
              reactions: { userId, emoji, username },
            },
          });

          io.to(conversationId).emit(SOCKET_EVENTS.REACTION_ADDED, {
            messageId,
            conversationId,
            emoji,
            userId,
            username,
          });
        });
      }
    );

    // ── message:unreact ───────────────────────────────────────────────────────

    socket.on(
      SOCKET_EVENTS.MSG_UNREACT,
      ({
        messageId,
        emoji,
        conversationId,
      }: {
        messageId: string;
        emoji: string;
        conversationId: string;
      }) => {
        safeAsync(async () => {
          await assertMember(conversationId, userId);

          const result = await Message.findByIdAndUpdate(messageId, {
            $pull: {
              reactions: { userId, emoji },
            },
          });

          if (!result) return;

          io.to(conversationId).emit(SOCKET_EVENTS.REACTION_REMOVED, {
            messageId,
            conversationId,
            emoji,
            userId,
          });
        });
      }
    );

    // ── conversation:read ─────────────────────────────────────────────────────

    socket.on(SOCKET_EVENTS.CONV_READ, ({ conversationId }: ReadConversationPayload) => {
      safeAsync(async () => {
        await assertMember(conversationId, userId);

        const unread = await Message.find({
          conversationId,
          senderId: { $ne: userId },
          readBy: { $nin: [userId] },
        }).select('_id');

        if (!unread.length) return;

        const ids = unread.map((m) => m._id.toString());

        await Message.updateMany(
          { _id: { $in: ids } },
          { $addToSet: { readBy: userId }, $set: { status: 'read' } }
        );

        io.to(conversationId).emit(SOCKET_EVENTS.MSG_READ, {
          conversationId,
          messageIds: ids,
          userId,
          readAt: new Date().toISOString(),
        });
      });
    });

    // ── typing:start / typing:stop ────────────────────────────────────────────

    socket.on(SOCKET_EVENTS.TYPING_START, ({ conversationId }: TypingPayload) => {
      safeAsync(async () => {
        await assertMember(conversationId, userId);
        socket.to(conversationId).emit(SOCKET_EVENTS.TYPING_START, {
          conversationId,
          userName: username,
          userId,
        });

        const key = `${userId}:${conversationId}`;
        const existing = typingTimeouts.get(key);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          socket.to(conversationId).emit(SOCKET_EVENTS.TYPING_STOP, {
            conversationId,
            userName: username,
            userId,
          });
          typingTimeouts.delete(key);
        }, SOCKET.TYPING_TIMEOUT_MS);

        typingTimeouts.set(key, timer);
      });
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, ({ conversationId }: TypingPayload) => {
      safeAsync(async () => {
        await assertMember(conversationId, userId);
        const key = `${userId}:${conversationId}`;
        const timer = typingTimeouts.get(key);
        if (timer) {
          clearTimeout(timer);
          typingTimeouts.delete(key);
        }
        socket.to(conversationId).emit(SOCKET_EVENTS.TYPING_STOP, {
          conversationId,
          userName: username,
          userId,
        });
      });
    });

    // ── call:initiate ─────────────────────────────────────────────────────────

    socket.on(SOCKET_EVENTS.CALL_INITIATE, ({ toUserId, type }: CallInitiatePayload) => {
      if (activeCalls.has(userId) || activeCalls.has(toUserId)) {
        socket.emit(SOCKET_EVENTS.CALL_BUSY, { toUserId });
        return;
      }
      activeCalls.set(userId, toUserId);
      activeCalls.set(toUserId, userId);
      io.to(toUserId).emit(SOCKET_EVENTS.CALL_INCOMING, { fromUserId: userId, type });
    });

    socket.on(SOCKET_EVENTS.CALL_ACCEPT, ({ fromUserId }: { fromUserId: string }) => {
      io.to(fromUserId).emit(SOCKET_EVENTS.CALL_ACCEPTED, { byUserId: userId });
    });

    socket.on(SOCKET_EVENTS.CALL_REJECT, ({ fromUserId }: { fromUserId: string }) => {
      activeCalls.delete(userId);
      activeCalls.delete(fromUserId);
      io.to(fromUserId).emit(SOCKET_EVENTS.CALL_REJECTED, { byUserId: userId });
    });

    socket.on(SOCKET_EVENTS.CALL_END, ({ toUserId }: { toUserId: string }) => {
      activeCalls.delete(userId);
      activeCalls.delete(toUserId);
      io.to(toUserId).emit(SOCKET_EVENTS.CALL_ENDED, { fromUserId: userId });
    });

    // ── WebRTC signalling ─────────────────────────────────────────────────────

    socket.on(
      SOCKET_EVENTS.WEBRTC_OFFER,
      ({ toUserId, offer }: { toUserId: string; offer: RTCSessionDescriptionInit }) => {
        io.to(toUserId).emit(SOCKET_EVENTS.WEBRTC_OFFER, { fromUserId: userId, offer });
      }
    );

    socket.on(
      SOCKET_EVENTS.WEBRTC_ANSWER,
      ({ toUserId, answer }: { toUserId: string; answer: RTCSessionDescriptionInit }) => {
        io.to(toUserId).emit(SOCKET_EVENTS.WEBRTC_ANSWER, { fromUserId: userId, answer });
      }
    );

    socket.on(
      SOCKET_EVENTS.WEBRTC_ICE,
      ({ toUserId, candidate }: { toUserId: string; candidate: RTCIceCandidateInit }) => {
        io.to(toUserId).emit(SOCKET_EVENTS.WEBRTC_ICE, { fromUserId: userId, candidate });
      }
    );

    // ── disconnect ────────────────────────────────────────────────────────────

    socket.on('disconnect', (reason: string) => {
      onlineUsers.delete(userId);
      io.emit(SOCKET_EVENTS.USER_OFFLINE, { userId });

      for (const [key, timer] of typingTimeouts.entries()) {
        if (key.startsWith(`${userId}:`)) {
          clearTimeout(timer);
          typingTimeouts.delete(key);
        }
      }

      const peer = activeCalls.get(userId);
      if (peer) {
        io.to(peer).emit(SOCKET_EVENTS.CALL_ENDED, { fromUserId: userId });
        activeCalls.delete(peer);
        activeCalls.delete(userId);
      }

      logger.info('[SOCKET] Disconnected', { socketId: socket.id, userId, reason });
    });
  });
}
