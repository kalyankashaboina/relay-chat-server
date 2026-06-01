import type { Socket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';

export interface SocketData {
  userId: string;
}

export type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  tempId?: string;
}

export interface EditMessagePayload {
  messageId: string;
  content: string;
}

export interface DeleteMessagePayload {
  messageId: string;
}

export interface TypingPayload {
  conversationId: string;
}

export interface ReadConversationPayload {
  conversationId: string;
}

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
