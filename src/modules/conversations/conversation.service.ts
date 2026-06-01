import { Types } from 'mongoose';

import { logger } from '../../shared/logger';
import { AppError } from '../../shared/errors/AppError';
import {
  createDirectSchema,
  createGroupSchema,
  conversationsPaginationSchema,
  conversationsSearchSchema,
  type CreateDirectInput,
  type CreateGroupInput,
  type ConversationsPaginationInput,
  type ConversationsSearchInput,
} from '../../shared/validators';
import { userRepository } from '../users/repository/user.repository';

import { conversationRepository } from './repository/conversation.repository';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PopulatedUser {
  _id: { toString(): string };
  username?: string;
  avatar?: string;
  isOnline?: boolean;
}

interface PopulatedConversation {
  _id: { toString(): string };
  type: 'direct' | 'group';
  name?: string;
  participants?: PopulatedUser[];
  lastMessage?: unknown;
  updatedAt?: Date;
  admins?: { toString(): string }[];
  createdBy?: { toString(): string };
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapConversation(conv: PopulatedConversation, userId: string) {
  const isGroup = conv.type === 'group';
  const participants = conv.participants ?? [];

  const otherUser = isGroup ? null : participants.find((p) => p._id.toString() !== userId);

  return {
    id: conv._id.toString(),
    type: conv.type,
    isGroup,
    groupName: isGroup ? conv.name : undefined,
    user: otherUser
      ? {
          id: otherUser._id.toString(),
          name: otherUser.username ?? 'Unknown',
          username: otherUser.username ?? 'Unknown',
          avatar: otherUser.avatar ?? '',
          isOnline: otherUser.isOnline ?? false,
        }
      : undefined,
    users: isGroup
      ? participants.map((p) => ({
          id: p._id.toString(),
          name: p.username ?? 'Unknown',
          username: p.username ?? 'Unknown',
          avatar: p.avatar ?? '',
          isOnline: p.isOnline ?? false,
        }))
      : undefined,
    participants: participants.map((p) => p._id.toString()),
    lastMessage: conv.lastMessage ?? null,
    unreadCount: 0,
    updatedAt: conv.updatedAt,
  };
}

function slicePaginated<T>(items: T[], limit: number): { items: T[]; hasMore: boolean } {
  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  return { items, hasMore };
}

function toPopulated(raw: unknown): PopulatedConversation {
  return raw as PopulatedConversation;
}

// ── Create or get direct ──────────────────────────────────────────────────────

export async function createOrGetDirectConversation(raw: CreateDirectInput) {
  const { userId, targetUserId } = createDirectSchema.parse(raw);

  const userOid = new Types.ObjectId(userId);
  const targetOid = new Types.ObjectId(targetUserId);

  const existing = await conversationRepository.findDirect(userOid, targetOid);
  if (existing) return mapConversation(toPopulated(existing), userId);

  const created = await conversationRepository.create({
    type: 'direct',
    participants: [userOid, targetOid],
  });

  const populated = await conversationRepository.findById(created._id.toString());
  if (!populated) throw new AppError('Failed to create conversation', 500);
  return mapConversation(toPopulated(populated), userId);
}

// ── Create group ──────────────────────────────────────────────────────────────

export async function createGroupConversation(raw: CreateGroupInput) {
  const { creatorId, name, memberIds } = createGroupSchema.parse(raw);

  const uniqueIds = Array.from(new Set([creatorId, ...memberIds]));
  if (uniqueIds.length < 3) throw new AppError('Group requires at least 3 members total', 400);

  const participants = uniqueIds.map((id) => new Types.ObjectId(id));

  const created = await conversationRepository.create({
    type: 'group',
    name: name.trim(),
    createdBy: new Types.ObjectId(creatorId),
    participants,
  });

  const populated = await conversationRepository.findById(created._id.toString());
  if (!populated) throw new AppError('Failed to create group conversation', 500);
  logger.info('Group created', { groupId: created._id, creatorId });
  return mapConversation(toPopulated(populated), creatorId);
}

// ── Paginated sidebar conversations ──────────────────────────────────────────

export async function getPaginatedConversations(raw: ConversationsPaginationInput) {
  const { userId, cursor, limit } = conversationsPaginationSchema.parse(raw);

  const userOid = new Types.ObjectId(userId);
  const rows = await conversationRepository.paginatedForUser(userOid, cursor ?? null, limit);

  const { items, hasMore } = slicePaginated(rows, limit);

  return {
    conversations: items.map((c) => mapConversation(toPopulated(c), userId)),
    nextCursor: hasMore
      ? ((items[items.length - 1] as { updatedAt?: Date })?.updatedAt?.toISOString() ?? null)
      : null,
    hasMore,
  };
}

// ── Search conversations ──────────────────────────────────────────────────────

export async function searchConversations(raw: ConversationsSearchInput) {
  const { userId, query, cursor, limit } = conversationsSearchSchema.parse(raw);

  const userOid = new Types.ObjectId(userId);
  const nameRegex = new RegExp(query, 'i');
  const matchingUsers = await userRepository.findByUsernameRegex(nameRegex);
  const matchingUserIds = (matchingUsers as { _id: { toString(): string } }[]).map(
    (u) => new Types.ObjectId(u._id.toString())
  );

  const rows = await conversationRepository.searchForUser(
    userOid,
    matchingUserIds,
    nameRegex,
    cursor ?? null,
    limit
  );

  const { items, hasMore } = slicePaginated(rows, limit);

  return {
    conversations: items.map((c) => mapConversation(toPopulated(c), userId)),
    nextCursor: hasMore
      ? ((items[items.length - 1] as { updatedAt?: Date })?.updatedAt?.toISOString() ?? null)
      : null,
    hasMore,
  };
}

// ── Group Management ──────────────────────────────────────────────────────────

function isAdminOrCreator(conv: PopulatedConversation, userId: string): boolean {
  const isAdmin = (conv.admins ?? []).some((a) => a.toString() === userId);
  const isCreator = conv.createdBy?.toString() === userId;
  return isAdmin || isCreator;
}

export async function addGroupMember(conversationId: string, userId: string, newMemberId: string) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.type !== 'group') throw new AppError('Not a group conversation', 400);

  if (!isAdminOrCreator(toPopulated(conv), userId))
    throw new AppError('Only admins can add members', 403);

  const updated = await conversationRepository.addMember(
    conversationId,
    new Types.ObjectId(newMemberId)
  );
  logger.info('Group member added', { conversationId, newMemberId, addedBy: userId });
  return updated;
}

export async function removeGroupMember(
  conversationId: string,
  userId: string,
  memberToRemove: string
) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.type !== 'group') throw new AppError('Not a group conversation', 400);

  if (!isAdminOrCreator(toPopulated(conv), userId))
    throw new AppError('Only admins can remove members', 403);

  if (toPopulated(conv).createdBy?.toString() === memberToRemove)
    throw new AppError('Cannot remove group creator', 403);

  const updated = await conversationRepository.removeMember(
    conversationId,
    new Types.ObjectId(memberToRemove)
  );
  logger.info('Group member removed', { conversationId, memberToRemove, removedBy: userId });
  return updated;
}

export async function updateGroupInfo(
  conversationId: string,
  userId: string,
  updates: { name?: string; avatar?: string }
) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.type !== 'group') throw new AppError('Not a group conversation', 400);

  if (!isAdminOrCreator(toPopulated(conv), userId))
    throw new AppError('Only admins can update group info', 403);

  const updated = await conversationRepository.updateGroupInfo(conversationId, updates);
  logger.info('Group info updated', { conversationId, updates, updatedBy: userId });
  return updated;
}

export async function leaveGroup(conversationId: string, userId: string) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.type !== 'group') throw new AppError('Not a group conversation', 400);

  if (toPopulated(conv).createdBy?.toString() === userId)
    throw new AppError('Group creator cannot leave. Transfer ownership first.', 403);

  const updated = await conversationRepository.removeMember(
    conversationId,
    new Types.ObjectId(userId)
  );
  logger.info('User left group', { conversationId, userId });
  return updated;
}

// ── Mute / Archive ────────────────────────────────────────────────────────────

export async function muteConversation(conversationId: string, userId: string) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) throw new AppError('Conversation not found', 404);

  const isMember = (conv.participants as { toString(): string }[]).some(
    (p) => p.toString() === userId
  );
  if (!isMember) throw new AppError('Not a member of this conversation', 403);

  await conversationRepository.muteConversation(conversationId, new Types.ObjectId(userId));
  logger.info('Conversation muted', { conversationId, userId });
  return { success: true };
}

export async function unmuteConversation(conversationId: string, userId: string) {
  await conversationRepository.unmuteConversation(conversationId, new Types.ObjectId(userId));
  logger.info('Conversation unmuted', { conversationId, userId });
  return { success: true };
}

export async function archiveConversation(conversationId: string, userId: string) {
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) throw new AppError('Conversation not found', 404);

  const isMember = (conv.participants as { toString(): string }[]).some(
    (p) => p.toString() === userId
  );
  if (!isMember) throw new AppError('Not a member of this conversation', 403);

  await conversationRepository.archiveConversation(conversationId, new Types.ObjectId(userId));
  logger.info('Conversation archived', { conversationId, userId });
  return { success: true };
}

export async function unarchiveConversation(conversationId: string, userId: string) {
  await conversationRepository.unarchiveConversation(conversationId, new Types.ObjectId(userId));
  logger.info('Conversation unarchived', { conversationId, userId });
  return { success: true };
}
