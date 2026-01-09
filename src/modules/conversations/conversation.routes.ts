import { Router } from 'express';

import { requireAuth as authMiddleware } from '../auth/auth.middleware';

import {
  createConversation,
  getSidebarConversations,
  searchSidebarConversations,
  createGroup,
} from './conversation.controller';

const router = Router();

/**
 * Sidebar conversation list
 * GET /api/conversations
 */
router.get('/', authMiddleware, getSidebarConversations);
router.get('/search', authMiddleware, searchSidebarConversations);
router.post('/', authMiddleware, createConversation);

router.post('/group', authMiddleware, createGroup);

export default router;
