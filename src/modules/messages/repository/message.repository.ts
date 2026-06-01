import type { Types } from 'mongoose';
import { Message } from '../message.model';

interface ReplyToInput {
  messageId: Types.ObjectId;
  content: string;
  senderName: string;
}

interface AttachmentInput {
  name: string;
  mimeType: string;
  size: number;
  url: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'text';
}

interface CreateMessageData {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  attachments: AttachmentInput[];
  replyTo?: ReplyToInput;
}

type MessageFilter = Record<string, unknown>;

const SENDER_LOOKUP = {
  $lookup: {
    from: 'users',
    localField: 'senderId',
    foreignField: '_id',
    as: 'sender',
    pipeline: [{ $project: { _id: 1, username: 1, avatar: 1 } }],
  },
};

const UNWIND_SENDER = { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } };

export const messageRepository = {
  findById: (id: string) => Message.findById(id),

  findOwnedById: (id: string, senderId: string) =>
    Message.findOne({ _id: id, senderId, isDeleted: false }),

  create: (data: CreateMessageData) => Message.create(data),

  // Cursor-based pagination with sender joined via aggregation (no N+1)
  paginated: (conversationId: Types.ObjectId, cursor: Types.ObjectId | null, limit: number) =>
    Message.aggregate([
      { $match: { conversationId, isDeleted: false, ...(cursor ? { _id: { $lt: cursor } } : {}) } },
      { $sort: { _id: -1 } },
      { $limit: limit + 1 },
      SENDER_LOOKUP,
      UNWIND_SENDER,
    ]),

  unreadInConversation: (conversationId: string, excludeSenderId: string) =>
    Message.find({
      conversationId,
      senderId: { $ne: excludeSenderId },
      readBy: { $nin: [excludeSenderId] },
    }).select('_id'),

  markManyRead: (ids: string[], userId: string) =>
    Message.updateMany({ _id: { $in: ids } }, { $addToSet: { readBy: userId } }),

  softDelete: (id: string) =>
    Message.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
      content: '[Message deleted]',
    }),

  edit: (id: string, content: string) =>
    Message.findByIdAndUpdate(id, { content, isEdited: true, editedAt: new Date() }, { new: true }),

  addReaction: (messageId: string, userId: string, username: string, emoji: string) =>
    Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { reactions: { userId, username, emoji } } },
      { new: true }
    ),

  removeReaction: (messageId: string, userId: string, emoji: string) =>
    Message.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { userId, emoji } } },
      { new: true }
    ),

  star: (id: string, userId: string) =>
    Message.findByIdAndUpdate(id, { $addToSet: { starredBy: userId } }, { new: true }),

  unstar: (id: string, userId: string) =>
    Message.findByIdAndUpdate(id, { $pull: { starredBy: userId } }, { new: true }),

  pin: (id: string) =>
    Message.findByIdAndUpdate(id, { isPinned: true, pinnedAt: new Date() }, { new: true }),

  unpin: (id: string) =>
    Message.findByIdAndUpdate(id, { isPinned: false, $unset: { pinnedAt: '' } }, { new: true }),

  pinnedInConversation: (conversationId: string) =>
    Message.aggregate([
      { $match: { conversationId, isPinned: true, isDeleted: false } },
      { $sort: { pinnedAt: -1 } },
      SENDER_LOOKUP,
      UNWIND_SENDER,
    ]),

  findScheduled: (senderId: string) =>
    Message.find({ senderId, isScheduled: true, isDeleted: false }).sort({ scheduledAt: 1 }).lean(),

  deleteScheduled: (id: string, senderId: string) =>
    Message.findOneAndDelete({ _id: id, senderId, isScheduled: true }),

  // Full-text search with sender join in single aggregation pipeline (no N+1)
  searchMessages: (filter: MessageFilter, limit: number, skip: number) =>
    Message.aggregate([
      { $match: filter },
      { $sort: { score: { $meta: 'textScore' }, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      SENDER_LOOKUP,
      UNWIND_SENDER,
      { $project: { _id: 1, conversationId: 1, content: 1, createdAt: 1, sender: 1 } },
    ]),
};
