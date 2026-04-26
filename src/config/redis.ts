import Redis from 'ioredis';
import { logger } from '../shared/utils/logger';
import { env } from './env';

const baseOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times: number) => Math.min(times * 100, 2000),
};

function createRedisClient() {
  return new Redis(env.REDIS_URL, baseOptions);
}

export const redisClient = createRedisClient();
export const redisPub = createRedisClient();
export const redisSub = createRedisClient();

function attachEvents(client: Redis, name: string) {
  client.on('connect', () => logger.info(`${name} connected`));
  client.on('ready', () => logger.info(`${name} ready`));
  client.on('error', (err) => logger.error(`${name} error`, err));
  client.on('close', () => logger.warn(`${name} closed`));
}

attachEvents(redisClient, 'redisClient');
attachEvents(redisPub, 'redisPub');
attachEvents(redisSub, 'redisSub');

export async function connectRedis(): Promise<void> {
  try {
    await Promise.all([
      redisClient.connect(),
      redisPub.connect(),
      redisSub.connect(),
    ]);
    logger.info('Redis fully connected');
  } catch (error) {
    logger.error('Redis connection failed', error);
    if (env.NODE_ENV === 'production') process.exit(1);
  }
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([
    redisClient.quit(),
    redisPub.quit(),
    redisSub.quit(),
  ]);
  logger.info('Redis disconnected');
}

export async function isRedisHealthy(): Promise<boolean> {
  try {
    await redisClient.ping();
    return true;
  } catch {
    return false;
  }
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error('Cache get error', err);
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
    } catch (err) {
      logger.error('Cache set error', err);
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (err) {
      logger.error('Cache del error', err);
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      return (await redisClient.exists(key)) === 1;
    } catch (err) {
      logger.error('Cache exists error', err);
      return false;
    }
  },
};

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

export const typingCache = {
  async setTyping(conversationId: string, userId: string): Promise<void> {
    await redisClient.set(`typing:${conversationId}:${userId}`, '1', 'EX', 8);
  },

  async removeTyping(conversationId: string, userId: string): Promise<void> {
    await redisClient.del(`typing:${conversationId}:${userId}`);
  },

  async getTypingUsers(conversationId: string): Promise<string[]> {
    const [_, keys] = await redisClient.scan(0, 'MATCH', `typing:${conversationId}:*`, 'COUNT', 100);
    return keys.map((k) => k.split(':')[2]);
  },
};

export default redisClient;