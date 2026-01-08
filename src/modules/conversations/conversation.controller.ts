import { Request, Response } from "express";
import {
  getPaginatedConversations,
  createOrGetDirectConversation,
  searchConversations,
  createGroupConversation,
} from "./conversation.service";

/* =====================================================
   GET SIDEBAR CONVERSATIONS (PAGINATED)
   GET /api/conversations
===================================================== */

export async function getSidebarConversations(
  req: Request,
  res: Response
) {
  try {
    const userId = (req as any).user?.id;
    const { cursor, limit } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const pageSize = Math.min(Number(limit) || 20, 50);

    const result = await getPaginatedConversations({
      userId,
      cursor: cursor as string | undefined,
      limit: pageSize,
    });

    return res.status(200).json({
      success: true,
      data: result.conversations,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
}

/* =====================================================
   CREATE OR GET DIRECT CONVERSATION
   POST /api/conversations
===================================================== */

export async function createConversation(
  req: Request,
  res: Response
) {
  try {
    const userId = (req as any).user?.id;
    const { userId: targetUserId } = req.body;

    if (!userId || !targetUserId) {
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }

    const conversation = await createOrGetDirectConversation(
      userId,
      targetUserId
    );

    return res.status(201).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create conversation",
    });
  }
}

/* =====================================================
   SEARCH CONVERSATIONS (PAGINATED)
   GET /api/conversations/search
===================================================== */

export async function searchSidebarConversations(
  req: Request,
  res: Response
) {
  try {
    const userId = (req as any).user?.id;
    const { q, cursor, limit } = req.query;

    if (!userId || !q || typeof q !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid search query",
      });
    }

    const pageSize = Math.min(Number(limit) || 20, 50);

    const result = await searchConversations({
      userId,
      query: q.trim(),
      cursor: cursor as string | undefined,
      limit: pageSize,
    });

    return res.status(200).json({
      success: true,
      data: result.conversations,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error("Search conversations error:", error);
    return res.status(500).json({
      success: false,
      message: "Search failed",
    });
  }
}



export async function createGroup(req: Request, res: Response) {
  try {
    const creatorId = (req as any).user?.id;
    const { name, memberIds } = req.body;

    if (!creatorId || !name || !Array.isArray(memberIds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid group payload",
      });
    }

    const conversation = await createGroupConversation({
      creatorId,
      name,
      memberIds,
    });

   

    return res.status(201).json({
      success: true,
      data: conversation,
    });
  } catch (err: any) {
    console.error("Error creating group conversation:", err);
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
}

