import { Conversation } from "./conversation.model";
import { Types } from "mongoose";

/* =====================================================
   CREATE OR GET DIRECT CONVERSATION
===================================================== */

export async function createOrGetDirectConversation(
  userId: string,
  targetUserId: string
) {
  const userObjectId = new Types.ObjectId(userId);
  const targetObjectId = new Types.ObjectId(targetUserId);

  // Check if direct conversation already exists
  const existing = await Conversation.findOne({
    type: "direct",
    participants: {
      $all: [userObjectId, targetObjectId],
      $size: 2,
    },
  });

  if (existing) {
    return existing;
  }

  // Create new direct conversation
  return Conversation.create({
    type: "direct",
    participants: [userObjectId, targetObjectId],
  });
}

/* =====================================================
   PAGINATED SIDEBAR CONVERSATIONS
===================================================== */

interface GetPaginatedConversationsArgs {
  userId: string;
  cursor?: string;
  limit: number;
}

export async function getPaginatedConversations({
  userId,
  cursor,
  limit,
}: GetPaginatedConversationsArgs) {
  const userObjectId = new Types.ObjectId(userId);

  const query: any = {
    participants: userObjectId,
  };

  if (cursor) {
    query._id = { $lt: new Types.ObjectId(cursor) };
  }

  const conversations = await Conversation.find(query)
    .populate({
      path: "participants",
      select: "_id username avatar isOnline",
    })
    .populate({
      path: "lastMessage",
      select: "_id content senderId createdAt status",
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = conversations.length > limit;
  if (hasMore) conversations.pop();

  return {
    conversations: mapConversations(conversations, userId),
    nextCursor: hasMore
      ? conversations[conversations.length - 1]._id.toString()
      : null,
    hasMore,
  };
}

/* =====================================================
   SEARCH CONVERSATIONS (PAGINATED)
===================================================== */

interface SearchConversationsArgs {
  userId: string;
  query: string;
  cursor?: string;
  limit: number;
}

export async function searchConversations({
  userId,
  query,
  cursor,
  limit,
}: SearchConversationsArgs) {
  const userObjectId = new Types.ObjectId(userId);

  const mongoQuery: any = {
    participants: userObjectId,
    $or: [
      { name: { $regex: query, $options: "i" } }, // groups (future)
    ],
  };

  if (cursor) {
    mongoQuery._id = { $lt: new Types.ObjectId(cursor) };
  }

  const conversations = await Conversation.find(mongoQuery)
    .populate({
      path: "participants",
      select: "_id username avatar isOnline",
    })
    .populate({
      path: "lastMessage",
      select: "_id content senderId createdAt status",
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = conversations.length > limit;
  if (hasMore) conversations.pop();

  return {
    conversations: mapConversations(conversations, userId),
    nextCursor: hasMore
      ? conversations[conversations.length - 1]._id.toString()
      : null,
    hasMore,
  };
}

/* =====================================================
   INTERNAL MAPPER (IMPORTANT)
===================================================== */

function mapConversations(conversations: any[], userId: string) {
  return conversations.map((conv) => {
    const otherUser =
      conv.type === "direct"
        ? conv.participants.find(
            (p: any) => p._id.toString() !== userId
          )
        : null;

    return {
      id: conv._id.toString(),
      isGroup: conv.type === "group",

      user: otherUser
        ? {
            id: otherUser._id.toString(),
            username: otherUser.username ?? "Unknown",
            avatar: otherUser.avatar ?? "",
            isOnline: otherUser.isOnline ?? false,
          }
        : undefined,

      users:
        conv.type === "group"
          ? conv.participants.map((p: any) => ({
              id: p._id.toString(),
              username: p.username ?? "Unknown",
              avatar: p.avatar ?? "",
              isOnline: p.isOnline ?? false,
            }))
          : undefined,

      lastMessage: conv.lastMessage ?? null,
      unreadCount: 0, // placeholder (add later)
      updatedAt: conv.updatedAt,
    };
  });
}
