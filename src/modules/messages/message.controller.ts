import { Request, Response } from "express";
import { Types } from "mongoose";
import { getPaginatedMessages } from "./message.service";
import { Conversation } from "../conversations/conversation.model";

export async function getConversationMessages(
  req: Request,
  res: Response
) {
  try {
    const userId = (req as any).user?.id;
    const { conversationId } = req.params;
    const { cursor, limit } = req.query;

    if (!userId || !conversationId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    if (!Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversationId",
      });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    }).select("_id");

    if (!conversation) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const pageSize = Math.min(Number(limit) || 30, 50);

    const result = await getPaginatedMessages({
      conversationId,
      cursor: cursor ? String(cursor) : undefined,
      limit: pageSize,
    });

    return res.status(200).json({
      success: true,
      data: result.messages,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error: any) {
    console.error("Fetch messages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
}
