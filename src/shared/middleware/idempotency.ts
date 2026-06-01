// ─────────────────────────────────────────────────────────────────────────────
// shared/middleware/idempotency.ts
// In-memory idempotency — no Redis required.
// For a multi-instance deployment, replace the Map with a shared store.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

const responseCache = new Map<string, CachedResponse>();

/** Prune expired entries (called automatically on each request) */
function prune(): void {
  const now = Date.now();
  for (const [key, val] of responseCache.entries()) {
    if (val.expiresAt < now) responseCache.delete(key);
  }
}

/** HTTP idempotency middleware — checks X-Idempotency-Key header */
export function idempotency() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.headers['x-idempotency-key'] as string | undefined;
    if (!key) {
      next();
      return;
    }

    if (!UUID_RE.test(key)) {
      res.status(400).json({ error: 'Invalid idempotency key format. Must be a UUID.' });
      return;
    }

    prune();

    const cached = responseCache.get(key);
    if (cached) {
      logger.info(`[IDEMPOTENCY] Replaying cached response for key: ${key}`);
      res.status(cached.status).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      responseCache.set(key, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
      return originalJson(body);
    };

    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket idempotency — deduplicates in-flight socket messages
// ─────────────────────────────────────────────────────────────────────────────

const processedMessages = new Map<string, number>(); // tempId → expiresAt
const MSG_TTL_MS = 24 * 60 * 60 * 1000;

function pruneMessages(): void {
  const now = Date.now();
  for (const [key, exp] of processedMessages.entries()) {
    if (exp < now) processedMessages.delete(key);
  }
}

export class SocketIdempotency {
  /** Returns true if duplicate (and marks as processed), false if new */
  static checkAndMark(messageId: string): boolean {
    pruneMessages();
    if (processedMessages.has(messageId)) {
      logger.warn(`[IDEMPOTENCY] Duplicate message blocked: ${messageId}`);
      return true;
    }
    processedMessages.set(messageId, Date.now() + MSG_TTL_MS);
    return false;
  }
}

export default idempotency;
