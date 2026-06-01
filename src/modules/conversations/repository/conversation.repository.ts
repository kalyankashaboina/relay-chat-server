import { Types } from 'mongoose';
import { Conversation } from '../conversation.model';

const PARTICIPANT_PROJECT = { _id: 1, username: 1, avatar: 1, isOnline: 1 };
const LAST_MSG_PROJECT = { _id: 1, content: 1, senderId: 1, createdAt: 1, isDeleted: 1, type: 1 };

const participantsLookup = {
  $lookup: {
    from: 'users',
    localField: 'participants',
    foreignField: '_id',
    as: 'participants',
    pipeline: [{ $project: PARTICIPANT_PROJECT }],
  },
};

const lastMessageLookup = {
  $lookup: {
    from: 'messages',
    localField: 'lastMessage',
    foreignField: '_id',
    as: 'lastMessageArr',
    pipeline: [{ $project: LAST_MSG_PROJECT }],
  },
};

// preserveNullAndEmptyArrays keeps conversations that have no lastMessage
const UNWIND_LAST_MSG = {
  $unwind: { path: '$lastMessageArr', preserveNullAndEmptyArrays: true },
};

// Promote the unwound doc into lastMessage, then drop the temp array field
const ADD_LAST_MSG = { $addFields: { lastMessage: '$lastMessageArr' } };
const DROP_TEMP_ARR = { $project: { lastMessageArr: 0 } };

function sidebarPipeline(
  matchStage: Record<string, unknown>,
  cursor: string | null,
  limit: number
) {
  const match = {
    ...matchStage,
    ...(cursor ? { updatedAt: { $lt: new Date(cursor) } } : {}),
  };
  return [
    { $match: match },
    { $sort: { updatedAt: -1 as -1 } },
    { $limit: limit + 1 } as { $limit: number },
    participantsLookup,
    lastMessageLookup,
    UNWIND_LAST_MSG,
    ADD_LAST_MSG,
    DROP_TEMP_ARR,
  ];
}

export const conversationRepository = {
  findDirect: (userA: Types.ObjectId, userB: Types.ObjectId) =>
    Conversation.aggregate([
      { $match: { type: 'direct', participants: { $all: [userA, userB], $size: 2 } } },
      { $limit: 1 },
      participantsLookup,
      lastMessageLookup,
      UNWIND_LAST_MSG,
      ADD_LAST_MSG,
      DROP_TEMP_ARR,
    ]).then((r) => r[0] ?? null),

  findById: (id: string) =>
    Conversation.aggregate([
      { $match: { _id: new Types.ObjectId(id) } },
      participantsLookup,
      lastMessageLookup,
      UNWIND_LAST_MSG,
      ADD_LAST_MSG,
      DROP_TEMP_ARR,
    ]).then((r) => r[0] ?? null),

  create: (data: {
    type: 'direct' | 'group';
    participants: Types.ObjectId[];
    name?: string;
    createdBy?: Types.ObjectId;
  }) => Conversation.create(data),

  paginatedForUser: (userId: Types.ObjectId, cursor: string | null, limit: number) =>
    Conversation.aggregate(sidebarPipeline({ participants: userId }, cursor, limit)),

  searchForUser: (
    userId: Types.ObjectId,
    matchingUserIds: Types.ObjectId[],
    nameRegex: RegExp,
    cursor: string | null,
    limit: number
  ) =>
    Conversation.aggregate(
      sidebarPipeline(
        {
          participants: userId,
          $or: [{ name: nameRegex }, { type: 'direct', participants: { $in: matchingUserIds } }],
        },
        cursor,
        limit
      )
    ),

  updateLastMessage: (conversationId: string, messageId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: messageId,
      updatedAt: new Date(),
    }),

  memberIds: (conversationId: string) =>
    Conversation.findById(conversationId).select('participants').lean(),

  findByParticipant: (userId: string) =>
    Conversation.find({ participants: userId }).select('_id').lean(),

  addMember: (conversationId: string, userId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(
      conversationId,
      { $addToSet: { participants: userId }, updatedAt: new Date() },
      { new: true }
    ),

  removeMember: (conversationId: string, userId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(
      conversationId,
      { $pull: { participants: userId }, updatedAt: new Date() },
      { new: true }
    ),

  updateGroupInfo: (conversationId: string, updates: { name?: string; avatar?: string }) =>
    Conversation.findByIdAndUpdate(
      conversationId,
      { ...updates, updatedAt: new Date() },
      { new: true }
    ),

  muteConversation: (conversationId: string, userId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(conversationId, { $addToSet: { mutedBy: userId } }),

  unmuteConversation: (conversationId: string, userId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(conversationId, { $pull: { mutedBy: userId } }),

  archiveConversation: (conversationId: string, userId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(conversationId, { $addToSet: { archivedBy: userId } }),

  unarchiveConversation: (conversationId: string, userId: Types.ObjectId) =>
    Conversation.findByIdAndUpdate(conversationId, { $pull: { archivedBy: userId } }),
};
