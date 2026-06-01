import type { Request, Response, NextFunction } from 'express';

import { parseIntQuery } from '../../shared/utils';
import { PAGINATION } from '../../shared/constants';
import { AppError } from '../../shared/errors/AppError';

import {
  createOrGetDirectConversation,
  createGroupConversation,
  getPaginatedConversations,
  searchConversations,
  addGroupMember,
  removeGroupMember,
  updateGroupInfo,
  leaveGroup as leaveGroupFunc,
  muteConversation,
  unmuteConversation,
  archiveConversation,
  unarchiveConversation,
} from './conversation.service';

function getUserId(req: Request): string {
  const id = req.user?._id ?? req.user?.userId;
  if (!id) throw new AppError('Unauthorized', 401);
  return String(id);
}

function handleError(res: Response, err: unknown): Response {
  const e = err as { statusCode?: number; message?: string };
  return res
    .status(e.statusCode ?? 500)
    .json({ success: false, message: e.message ?? 'Internal server error' });
}

export async function getSidebarConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const limit = parseIntQuery(req.query.limit, PAGINATION.DEFAULT_LIMIT);
    const cursor = req.query.cursor as string | undefined;
    const result = await getPaginatedConversations({ userId, cursor, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

export async function createConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const body = req.body as { targetUserId?: string; userId?: string };
    const targetUserId = body.targetUserId ?? body.userId;
    if (!targetUserId)
      return res.status(400).json({ success: false, message: 'targetUserId is required' });
    const result = await createOrGetDirectConversation({ userId, targetUserId });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

export async function searchSidebarConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ success: false, message: 'q is required' });
    const limit = parseIntQuery(req.query.limit, PAGINATION.DEFAULT_LIMIT);
    const cursor = req.query.cursor as string | undefined;
    const result = await searchConversations({ userId, query, cursor, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

export async function createGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const creatorId = getUserId(req);
    const { name, memberIds } = req.body as { name: string; memberIds: string[] };
    const result = await createGroupConversation({ creatorId, name, memberIds });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { userId: newMemberId } = req.body as { userId: string };
    const currentUserId = getUserId(req);
    const updated = await addGroupMember(id, currentUserId, newMemberId);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, userId: memberToRemove } = req.params;
    const currentUserId = getUserId(req);
    const updated = await removeGroupMember(id, currentUserId, memberToRemove);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

export async function updateGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { name, avatar } = req.body as { name?: string; avatar?: string };
    const updated = await updateGroupInfo(id, userId, { name, avatar });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

export async function leaveGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const updated = await leaveGroupFunc(id, userId);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

export async function mute(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const result = await muteConversation(id, userId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function unmute(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const result = await unmuteConversation(id, userId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function archive(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const result = await archiveConversation(id, userId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function unarchive(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const result = await unarchiveConversation(id, userId);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// suppress unused import
void handleError;
