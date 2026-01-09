import type { Server } from 'socket.io';

import { User } from '../users/user.model';
import { Conversation } from '../conversations/conversation.model';
import { Message } from '../messages/message.model';
import { createMessage } from '../messages/message.service';

import type {
  AuthenticatedSocket,
  SendMessagePayload,
  DeleteMessagePayload,
  TypingPayload,
  ReadConversationPayload,
  CallInitiatePayload,
} from './socket.types';

/* ================= STATE ================= */

const onlineUsers = new Set<string>();
const activeCalls = new Map<string, string>(); // userId → peerId

/* ================= HELPERS ================= */

async function assertConversationMember(conversationId: string, userId: string) {
  const convo = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
  }).select('_id');

  if (!convo) {
    console.error('[SOCKET][AUTH] Forbidden conversation access', {
      userId,
      conversationId,
    });
    throw new Error('FORBIDDEN');
  }
}

/* ================= SOCKET EVENTS ================= */

export function registerSocketEvents(io: Server) {
  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;

    console.log('[SOCKET] Connection attempt', {
      socketId: socket.id,
      userId,
    });

    if (!userId) {
      socket.disconnect();
      return;
    }

    const user = await User.findById(userId).select('username');
    if (!user) {
      socket.disconnect();
      return;
    }

    console.log('[SOCKET] Connected', {
      socketId: socket.id,
      userId,
      username: user.username,
    });

    /* ================= USER ROOM ================= */

    socket.join(userId);

    /* ================= PRESENCE ================= */

    onlineUsers.add(userId);
    io.emit('user:online', { userId });

    socket.emit('presence:init', {
      onlineUsers: Array.from(onlineUsers),
    });

    /* ================= JOIN CONVERSATIONS ================= */

    const conversations = await Conversation.find({
      participants: userId,
    }).select('_id');

    conversations.forEach((c) => socket.join(c._id.toString()));

    /* ======================================================
       MESSAGE SEND → SENT → DELIVERED
       ====================================================== */

    socket.on('message:send', async ({ conversationId, content, tempId }: SendMessagePayload) => {
      console.log('[SOCKET][message:send]', {
        userId,
        conversationId,
        tempId,
      });

      if (!conversationId || !content) {
        socket.emit('message:failed', {
          tempId,
          reason: 'INVALID_PAYLOAD',
        });
        return;
      }

      try {
        await assertConversationMember(conversationId, userId);

        const saved = await createMessage({
          conversationId,
          senderId: userId,
          content,
          type: 'text',
        });

        /* ---------- message:new ---------- */
        io.to(conversationId).emit('message:new', {
          id: saved._id.toString(),
          tempId,
          conversationId,
          senderId: userId,
          content: saved.content,
          createdAt: saved.createdAt.toISOString(),
        });

        /* ---------- SENT (to sender only) ---------- */
        socket.emit('message:sent', {
          tempId,
          messageId: saved._id.toString(),
          conversationId,
          createdAt: saved.createdAt.toISOString(),
        });

        /* ---------- DELIVERED (to recipients only) ---------- */
        socket.to(conversationId).emit('message:delivered', {
          messageId: saved._id.toString(),
          conversationId,
          deliveredAt: new Date().toISOString(),
        });

        console.log('[SOCKET][message] sent → delivered', {
          messageId: saved._id.toString(),
          content: saved.content,
        });
      } catch (err) {
        console.error('[SOCKET][message:send] Failed', err);

        socket.emit('message:failed', {
          tempId,
          reason: 'SEND_FAILED',
        });
      }
    });

    /* ================= MESSAGE DELETE ================= */

    socket.on('message:delete', async ({ messageId }: DeleteMessagePayload) => {
      const msg = await Message.findOne({
        _id: messageId,
        senderId: userId,
        isDeleted: false,
      });

      if (!msg) return;

      await assertConversationMember(msg.conversationId.toString(), userId);

      msg.isDeleted = true;
      msg.deletedAt = new Date();
      await msg.save();

      io.to(msg.conversationId.toString()).emit('message:deleted', {
        messageId,
        conversationId: msg.conversationId.toString(),
        deletedAt: msg.deletedAt.toISOString(),
      });
    });

    /* ================= READ RECEIPTS ================= */

    socket.on('conversation:read', async ({ conversationId }: ReadConversationPayload) => {
      await assertConversationMember(conversationId, userId);

      const unread = await Message.find({
        conversationId,
        senderId: { $ne: userId },
        readBy: { $ne: userId },
      }).select('_id');

      const ids = unread.map((m) => m._id.toString());

      if (!ids.length) return;

      await Message.updateMany({ _id: { $in: ids } }, { $addToSet: { readBy: userId } });

      io.to(conversationId).emit('message:read', {
        conversationId,
        messageIds: ids,
        userId,
        readAt: new Date().toISOString(),
      });
    });

    /* ================= TYPING ================= */

    socket.on('typing:start', async ({ conversationId }: TypingPayload) => {
      console.log('[SOCKET][typing:start]', {
        userId,
        conversationId,
      });
      await assertConversationMember(conversationId, userId);

      socket.to(conversationId).emit('typing:start', {
        conversationId,
        userName: user.username,
      });
    });

    socket.on('typing:stop', async ({ conversationId }: TypingPayload) => {
      console.log('[SOCKET][typing:stop]', {
        userId,
        conversationId,
      });
      await assertConversationMember(conversationId, userId);

      socket.to(conversationId).emit('typing:stop', {
        conversationId,
        userName: user.username,
      });
    });

    /* ================= CALL EVENTS ================= */

    socket.on('call:initiate', ({ toUserId, type }: CallInitiatePayload) => {
      if (activeCalls.has(userId) || activeCalls.has(toUserId)) {
        socket.emit('call:busy', { toUserId });
        return;
      }

      activeCalls.set(userId, toUserId);
      activeCalls.set(toUserId, userId);

      io.to(toUserId).emit('call:incoming', {
        fromUserId: userId,
        type,
      });
    });

    /* ================= DISCONNECT ================= */

    socket.on('disconnect', () => {
      console.log('[SOCKET] Disconnected', { userId });

      onlineUsers.delete(userId);
      io.emit('user:offline', { userId });

      const peer = activeCalls.get(userId);
      if (peer) {
        io.to(peer).emit('call:ended', { fromUserId: userId });
        activeCalls.delete(peer);
        activeCalls.delete(userId);
      }
    });
  });
}
