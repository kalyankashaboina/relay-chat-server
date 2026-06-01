import type { Request, Response } from 'express';
import { Types } from 'mongoose';

import { AppError } from '../../shared/errors/AppError';
import { HTTP } from '../../shared/constants';
import { asyncHandler } from '../../shared/middleware/asyncHandler';
import { Conversation } from '../conversations/conversation.model';
import { scheduledMessageSchema } from '../../shared/validators';

import { getPaginatedMessages, searchMessages } from './message.service';
import { Message } from './message.model';
import { messageRepository } from './repository/message.repository';

export const getConversationMessages = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = req.user!.userId;

  const convo = await Conversation.findOne({ _id: conversationId, participants: userId }).select(
    '_id'
  );
  if (!convo) throw new AppError('Conversation not found or access denied', HTTP.FORBIDDEN);

  const result = await getPaginatedMessages({
    conversationId,
    cursor: req.query.cursor as string | undefined,
    limit: Number(req.query.limit) || 40,
  });

  res.json({ success: true, ...result });
});

export const starMessage = asyncHandler(async (req: Request, res: Response) => {
  const msg = await messageRepository.star(req.params.id, req.user!.userId);
  if (!msg) throw new AppError('Message not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: msg });
});

export const unstarMessage = asyncHandler(async (req: Request, res: Response) => {
  const msg = await messageRepository.unstar(req.params.id, req.user!.userId);
  if (!msg) throw new AppError('Message not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: msg });
});

export const pinMessage = asyncHandler(async (req: Request, res: Response) => {
  const msg = await Message.findById(req.params.id).lean();
  if (!msg) throw new AppError('Message not found', HTTP.NOT_FOUND);
  await messageRepository.pin(req.params.id);
  res.json({ success: true });
});

export const unpinMessage = asyncHandler(async (req: Request, res: Response) => {
  await messageRepository.unpin(req.params.id);
  res.json({ success: true });
});

export const getPinnedMessages = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = req.user!.userId;
  const convo = await Conversation.findOne({ _id: conversationId, participants: userId }).select(
    '_id'
  );
  if (!convo) throw new AppError('Access denied', HTTP.FORBIDDEN);
  const messages = await messageRepository.pinnedInConversation(conversationId);
  res.json({ success: true, data: messages });
});

export const forwardMessage = asyncHandler(async (req: Request, res: Response) => {
  const { toConversationId } = req.body as { toConversationId?: string };
  const userId = req.user!.userId;

  if (!toConversationId) throw new AppError('toConversationId is required', HTTP.BAD_REQ);

  const original = await Message.findById(req.params.id).lean();
  if (!original || original.isDeleted) throw new AppError('Message not found', HTTP.NOT_FOUND);

  const destConvo = await Conversation.findOne({
    _id: toConversationId,
    participants: userId,
  }).select('_id');
  if (!destConvo) throw new AppError('Destination conversation not found', HTTP.FORBIDDEN);

  interface MessageDoc {
    content?: string;
    type?: string;
    attachments?: unknown[];
    senderId?: unknown;
  }
  const orig = original as MessageDoc;

  const forwarded = await Message.create({
    conversationId: new Types.ObjectId(toConversationId),
    senderId: new Types.ObjectId(userId),
    content: orig.content ?? '',
    type: (orig.type as 'text' | 'image' | 'file' | 'system') ?? 'text',
    attachments: orig.attachments ?? [],
    forwardedFrom: (orig.senderId as { toString(): string } | undefined)?.toString(),
  });

  res.status(HTTP.CREATED).json({ success: true, data: forwarded });
});

export const getScheduledMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await messageRepository.findScheduled(req.user!.userId);
  res.json({ success: true, data: messages });
});

export const createScheduledMessage = asyncHandler(async (req: Request, res: Response) => {
  const parsed = scheduledMessageSchema.parse({ ...req.body, senderId: req.user!.userId });
  const msg = await Message.create({
    conversationId: new Types.ObjectId(parsed.conversationId),
    senderId: new Types.ObjectId(parsed.senderId),
    content: parsed.content,
    type: 'text',
    attachments: [],
    isScheduled: true,
    scheduledAt: parsed.scheduledAt,
  });
  res.status(HTTP.CREATED).json({ success: true, data: msg });
});

export const deleteScheduledMessage = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await messageRepository.deleteScheduled(req.params.id, req.user!.userId);
  if (!deleted) throw new AppError('Scheduled message not found', HTTP.NOT_FOUND);
  res.json({ success: true });
});

export const searchMessagesController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { query, conversationId, senderId, limit, skip } = req.query;

  if (!query || typeof query !== 'string')
    throw new AppError('Search query is required', HTTP.BAD_REQ);

  const results = await searchMessages({
    userId,
    query,
    conversationId: conversationId as string | undefined,
    senderId: senderId as string | undefined,
    limit: limit ? Number(limit) : 20,
    skip: skip ? Number(skip) : 0,
  });

  res.json({ success: true, ...results });
});
