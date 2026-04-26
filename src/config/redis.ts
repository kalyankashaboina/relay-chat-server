import Redis from 'ioredis';
import { logger } from '../shared/utils/logger';
import { env } from './env';

// 🔥 Use REDIS_URL (Upstash / production)
const REDIS_URL = env.REDIS_URL;

// Base Redis options (shared)
const baseOptions = {
  maxRetriesPerRequest: null, // important for queues
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    return Math.min(times * 100, 2000);
  },
};

// ================================
// MAIN CLIENT (cache + presence)
// ================================
export const redisClient = new Redis(REDIS_URL, baseOptions);

// ================================
// PUB/SUB CLIENTS (separate connections)
// ================================
export const redisPub = new Redis(REDIS_URL, baseOptions);
export const redisSub = new Redis(REDIS_URL, baseOptions);

// ================================
// CONNECT
// ================================
export async function connectRedis(): Promise<void> {
  try {
    await Promise.all([redisClient.connect(), redisPub.connect(), redisSub.connect()]);

    logger.info('✅ Redis connected successfully');
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);

    // 🔴 IMPORTANT: in production, DO NOT continue without Redis
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

// ================================
// DISCONNECT
// ================================
export async function disconnectRedis(): Promise<void> {
  await Promise.all([redisClient.quit(), redisPub.quit(), redisSub.quit()]);

  logger.info('Redis disconnected');
}

// ================================
// HEALTH CHECK
// ================================
export async function isRedisHealthy(): Promise<boolean> {
  try {
    await redisClient.ping();
    return true;
  } catch {
    return false;
  }
}

// ================================
// CACHE HELPERS
// ================================
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds) {
        await redisClient.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, serialized);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error('Cache del error:', error);
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      return (await redisClient.exists(key)) === 1;
    } catch {
      return false;
    }
  },
};

// ================================
// PRESENCE (distributed-safe)
// ================================
export const presenceCache = {
  async setOnline(userId: string): Promise<void> {
    await redisClient.sadd('online_users', userId);

    await redisClient.set(`user:${userId}:last_seen`, Date.now().toString(), 'EX', 300);
  },

  async setOffline(userId: string): Promise<void> {
    await redisClient.srem('online_users', userId);

    await redisClient.set(`user:${userId}:last_seen`, Date.now().toString(), 'EX', 86400);
  },

  async getOnlineUsers(): Promise<string[]> {
    return redisClient.smembers('online_users');
  },

  async isOnline(userId: string): Promise<boolean> {
    return (await redisClient.sismember('online_users', userId)) === 1;
  },

  async getLastSeen(userId: string): Promise<number | null> {
    const val = await redisClient.get(`user:${userId}:last_seen`);
    return val ? parseInt(val) : null;
  },
};

// ================================
// TYPING (TTL BASED - NO MEMORY)
// ================================
export const typingCache = {
  async setTyping(conversationId: string, userId: string): Promise<void> {
    await redisClient.set(`typing:${conversationId}:${userId}`, '1', 'EX', 8);
  },

  async removeTyping(conversationId: string, userId: string): Promise<void> {
    await redisClient.del(`typing:${conversationId}:${userId}`);
  },

  async getTypingUsers(conversationId: string): Promise<string[]> {
    const keys = await redisClient.keys(`typing:${conversationId}:*`);
    return keys.map((k) => k.split(':')[2]);
  },
};

export default redisClient;
