/**
 * =====================================================
 *                   WORKER PROCESS ENTRY
 * =====================================================
 *
 * This is the ONLY entry point for the worker process.
 * It should be started with: node dist/worker.js
 *
 * Responsibilities:
 * - Connect to MongoDB
 * - Connect to Redis
 * - Register queue processors (exactly once)
 * - Keep the process alive
 *
 * CRITICAL: Do NOT import workers from API server
 * Each process (API and Worker) must run independently
 */

import mongoose from 'mongoose';
import { connectMongo } from './db/mongo';
import { connectRedis, disconnectRedis, isRedisHealthy } from './config/redis';
import { env } from './config/env';
import { logger } from './shared/utils/logger';
import { registerProcessors } from './workers/message.processor';
import { closeQueues } from './queues/message.queue';

let isShuttingDown = false;

async function startWorker() {
  logger.info('═════════════════════════════════════════════════════════════');
  logger.info('🚀 RELAY CHAT WORKER - STARTING');
  logger.info('═════════════════════════════════════════════════════════════');
  logger.info('[STARTUP] Environment Configuration', {
    NODE_ENV: env.NODE_ENV,
    LOG_LEVEL: env.LOG_LEVEL,
  });

  try {
    // ===== STEP 1: Connect to MongoDB =====
    logger.info('[STARTUP] Connecting to MongoDB...');
    await connectMongo();
    logger.info('[STARTUP] ✅ MongoDB connected', {
      status: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[STARTUP] ❌ MongoDB connection failed', err);
    process.exit(1);
  }

  try {
    // ===== STEP 2: Connect to Redis =====
    logger.info('[STARTUP] Connecting to Redis...');
    await connectRedis();

    const healthy = await Promise.race([
      isRedisHealthy(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
    ]);

    if (!healthy) throw new Error('Redis health check failed');

    logger.info('[STARTUP] ✅ Redis connected', {
      status: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[STARTUP] ❌ Redis connection failed', err);

    if (env.NODE_ENV === 'production') {
      logger.error('[STARTUP] Redis required in production. Exiting...');
      process.exit(1);
    }

    logger.warn('[STARTUP] ⚠️  Continuing without Redis (dev only)');
  }

  try {
    // ===== STEP 3: Register Queue Processors (ONLY PLACE THIS HAPPENS) =====
    logger.info('[STARTUP] Registering queue processors...');
    registerProcessors();
    logger.info('[STARTUP] ✅ Queue processors registered');
  } catch (err) {
    logger.error('[STARTUP] ❌ Failed to register processors', err);
    process.exit(1);
  }

  // ===== STEP 4: Worker is ready =====
  logger.info('═════════════════════════════════════════════════════════════');
  logger.info('✅ WORKER READY');
  logger.info('═════════════════════════════════════════════════════════════');
  logger.info('[STARTUP] Worker is processing jobs from queues', {
    timestamp: new Date().toISOString(),
  });
  logger.info('═════════════════════════════════════════════════════════════');

  // Keep worker alive
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

  process.on('uncaughtException', (err) => {
    logger.error('[EXCEPTION] Uncaught exception', err);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('[REJECTION] Unhandled rejection', reason);
    gracefulShutdown('unhandledRejection');
  });
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('═════════════════════════════════════════════════════════════');
  logger.info(`🛑 SHUTDOWN SIGNAL: ${signal}`);
  logger.info('═════════════════════════════════════════════════════════════');

  // Hard timeout to force exit if graceful shutdown takes too long
  const timeout = setTimeout(() => {
    logger.error('[SHUTDOWN] ⚠️  Force shutdown - timeout exceeded');
    process.exit(1);
  }, 10000);

  try {
    // Close queues first (they use Redis connections)
    logger.info('[SHUTDOWN] Closing message queues...');
    await closeQueues();
    logger.info('[SHUTDOWN] ✅ Message queues closed');

    // Disconnect Redis
    logger.info('[SHUTDOWN] Disconnecting Redis...');
    await disconnectRedis();
    logger.info('[SHUTDOWN] ✅ Redis disconnected');

    // Disconnect MongoDB
    logger.info('[SHUTDOWN] Closing MongoDB connection...');
    await mongoose.connection.close();
    logger.info('[SHUTDOWN] ✅ MongoDB disconnected');

    clearTimeout(timeout);
    logger.info('═════════════════════════════════════════════════════════════');
    logger.info('✅ SHUTDOWN COMPLETE - Worker stopped gracefully');
    logger.info('═════════════════════════════════════════════════════════════');
    process.exit(0);
  } catch (err) {
    logger.error('[SHUTDOWN] ❌ Shutdown error', err);
    clearTimeout(timeout);
    process.exit(1);
  }
}

// Start the worker
startWorker().catch((err) => {
  logger.error('[STARTUP] ❌ Worker startup failed', err);
  process.exit(1);
});
