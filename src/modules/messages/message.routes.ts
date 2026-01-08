import { Router } from "express";
import { getConversationMessages } from "./message.controller";
import { requireAuth } from "../auth/auth.middleware";

const router = Router();

router.get(
  "/conversations/:conversationId/messages",
  requireAuth,
  getConversationMessages
);

export default router;
