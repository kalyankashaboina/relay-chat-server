import { Router } from 'express';

import { requireAuth } from '../auth/auth.middleware';

import { getConversationMessages } from './message.controller';

const router = Router();

router.get('/conversations/:conversationId/messages', requireAuth, getConversationMessages);

export default router;
