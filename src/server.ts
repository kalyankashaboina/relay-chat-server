import http from 'http';
import mongoose from 'mongoose';

import { app } from './app';
import { env } from './config/env';
import { connectMongo } from './db/mongo';
import { initSocket } from './modules/socket';
import { connectRedis, disconnectRedis, isRedisHealthy } from './config/redis';
import { closeQueues } from './queues/message.queue';
import { monitorMemory, setupCleanupJobs } from './config/performance';
import { logger } from './shared/utils/logger';

let server: http.Server;
let isShuttingDown = false;

const connections = new Set<any>();

async function bootstrap() {
  logger.info('Starting Relay Chat Server');

  // Mongo (required)
  try {
    await connectMongo();
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection failed', err);
    process.exit(1);
  }

  // Redis (required in prod, optional in dev)
  try {
    await connectRedis();

    const ok = await Promise.race([
      isRedisHealthy(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
    ]);

    if (!ok) throw new Error('Redis unhealthy');

    logger.info('Redis connected');
  } catch (err) {
    logger.error('Redis connection failed', err);

    if (env.NODE_ENV === 'production') {
      logger.error('Redis required in production. Exiting...');
      process.exit(1);
    }

    logger.warn('Continuing without Redis (dev only)');
  }

  // HTTP + Socket
  server = http.createServer(app);
  initSocket(server);

  // Track connections for hard shutdown
  server.on('connection', (conn) => {
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
  });

  // Wait for server to actually start
  await new Promise<void>((resolve) => {
    server.listen(env.PORT,'0.0.0.0', () => {
      logger.info(`Server running on ${env.PORT}`);
      logger.info(`Frontend: ${env.ALLOWED_ORIGINS.split(',')[0].trim()}`);
      resolve();
    });
  });

  if (env.NODE_ENV !== 'production') monitorMemory();

  setupCleanupJobs();

  setupGracefulShutdown();
}

function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received, shutting down`);

    const timeout = setTimeout(() => {
      logger.error('Force shutdown');
      connections.forEach((conn) => conn.destroy());
      process.exit(1);
    }, 10000);

    try {
      // Stop new requests
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // Close queues first (they use Redis)
      await closeQueues();
      logger.info('Queues closed');

      // Then Redis
      await disconnectRedis();
      logger.info('Redis disconnected');

      // Then Mongo
      await mongoose.connection.close();
      logger.info('Mongo disconnected');

      clearTimeout(timeout);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Shutdown error', err);
      process.exit(1);
    }
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, shutdown);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
    shutdown('unhandledRejection');
  });
}

bootstrap();
