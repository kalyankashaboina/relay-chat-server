import { Types } from "mongoose";
import { Message } from "./message.model";
import { Conversation } from "../conversations/conversation.model";

/* =====================================================
   CREATE MESSAGE (PLAINTEXT)
===================================================== */

interface CreateMessageArgs {
  conversationId: string;
  senderId: string;
  content: string;
  type?: "text" | "image" | "file" | "system";
  attachments?: any[];
}

export async function createMessage({
  conversationId,
  senderId,
  content,
  type = "text",
  attachments = [],
}: CreateMessageArgs) {
  if (!content?.trim()) {
    throw new Error("EMPTY_MESSAGE");
  }

  if (
    !Types.ObjectId.isValid(conversationId) ||
    !Types.ObjectId.isValid(senderId)
  ) {
    throw new Error("INVALID_OBJECT_ID");
  }

  const conversation = await Conversation.findById(conversationId).select(
    "participants"
  );

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p) => p.toString() === senderId
  );

  if (!isParticipant) {
    throw new Error("FORBIDDEN");
  }

  return Message.create({
    conversationId: new Types.ObjectId(conversationId),
    senderId: new Types.ObjectId(senderId),
    content,
    type,
    attachments,
  });
}

/* =====================================================
   GET PAGINATED MESSAGES
===================================================== */

interface GetPaginatedMessagesArgs {
  conversationId: string;
  cursor?: string;
  limit: number;
}

export async function getPaginatedMessages({
  conversationId,
  cursor,
  limit,
}: GetPaginatedMessagesArgs) {
  const query: any = {
    conversationId: new Types.ObjectId(conversationId),
  };

  if (cursor) {
    if (!Types.ObjectId.isValid(cursor)) {
      throw new Error("INVALID_CURSOR");
    }
    query._id = { $lt: new Types.ObjectId(cursor) };
  }

  const messages = await Message.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  return {
    messages: messages.reverse(),
    nextCursor: hasMore ? messages[0]._id.toString() : null,
    hasMore,
  };
}
