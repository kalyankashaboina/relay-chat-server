import { Router } from 'express';

import { requireAuth } from '../auth/auth.middleware';

import { getUsers } from './user.controller';

const router = Router();

/**
 * GET /api/users
 * - list users
 * - search (q)
 * - pagination (cursor, limit)
 */
router.get('/', requireAuth, getUsers);

export default router;
