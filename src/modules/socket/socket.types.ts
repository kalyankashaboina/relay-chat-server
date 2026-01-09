import type { Socket } from 'socket.io';

/* ================= SOCKET DATA ================= */

export interface SocketData {
  userId: string;
}

export type AuthenticatedSocket = Socket<any, any, any, SocketData>;

/* ================= MESSAGE EVENTS ================= */

/**
 * Plain text message payload
 */
export interface SendMessagePayload {
  conversationId: string;
  content: string;
  tempId?: string;
}

/**
 * Edit message (plain text)
 */
export interface EditMessagePayload {
  messageId: string;
  content: string;
}

/**
 * Delete message
 */
export interface DeleteMessagePayload {
  messageId: string;
}

/**
 * Typing indicator
 */
export interface TypingPayload {
  conversationId: string;
}

/**
 * Mark conversation as read
 */
export interface ReadConversationPayload {
  conversationId: string;
}

/* ================= CALL EVENTS ================= */

export interface CallInitiatePayload {
  toUserId: string;
  type: 'audio' | 'video';
}

export interface CallAcceptPayload {
  toUserId: string;
}

export interface CallRejectPayload {
  toUserId: string;
}

export interface CallEndPayload {
  toUserId: string;
}

export interface CallSignalPayload {
  toUserId: string;
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit;
}
