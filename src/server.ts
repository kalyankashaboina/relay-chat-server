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
  logger.info('═════════════════════════════════════════════════════════════');
  logger.info('🚀 RELAY CHAT SERVER - STARTING');
  logger.info('═════════════════════════════════════════════════════════════');
  logger.info('[STARTUP] Environment Configuration', {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    LOG_LEVEL: env.LOG_LEVEL,
  });

  // Mongo (required)
  try {
    await connectMongo();
    logger.info('[STARTUP] ✅ MongoDB connected', {
      status: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[STARTUP] ❌ MongoDB connection failed', err);
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

    logger.info('[STARTUP] ✅ Redis connected', {
      status: 'CONNECTED',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[STARTUP] Redis connection failed', err);

    if (env.NODE_ENV === 'production') {
      logger.error('[STARTUP] ❌ Redis required in production. Exiting...');
      process.exit(1);
    }

    logger.warn('[STARTUP] ⚠️  Continuing without Redis (dev only)');
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
    server.listen(env.PORT, '0.0.0.0', () => {
      logger.info('═════════════════════════════════════════════════════════════');
      logger.info('✅ SERVER RUNNING');
      logger.info('═════════════════════════════════════════════════════════════');

      const baseUrl = `http://localhost:${env.PORT}`;
      const wsUrl = `ws://localhost:${env.PORT}`;

      logger.info('[STARTUP] 📡 API Server', {
        url: baseUrl,
        description: 'Use this URL for REST API calls',
      });

      logger.info('[STARTUP] 🔌 WebSocket Configuration', {
        socketUrl: wsUrl,
        description: 'IMPORTANT: Use this URL in frontend to connect to WebSocket',
        note: 'Connect via: io("' + wsUrl + '", { transports: ["websocket"] })',
      });

      logger.info('[STARTUP] 🌐 Frontend Origin', {
        url: env.ALLOWED_ORIGINS.split(',')[0].trim(),
        description: 'Allowed frontend origin for CORS',
      });

      logger.info('[STARTUP] 🏥 Health Checks', {
        health: `${baseUrl}/health`,
        readiness: `${baseUrl}/readiness`,
        description: 'Use these endpoints to check server status',
      });

      logger.info('[STARTUP] 📚 API Routes', {
        auth: `${baseUrl}/api/auth`,
        conversations: `${baseUrl}/api/conversations`,
        users: `${baseUrl}/api/users`,
        messages: `${baseUrl}/api/messages`,
        upload: `${baseUrl}/api/upload`,
      });

      logger.info('═════════════════════════════════════════════════════════════');
      logger.info('[STARTUP] Server startup complete. Ready for connections!');
      logger.info('═════════════════════════════════════════════════════════════');

      resolve();
    });
  });

  if (env.NODE_ENV !== 'production') {
    logger.info('[STARTUP] 📊 Memory monitoring enabled (dev mode)');
    monitorMemory();
  }

  setupCleanupJobs();

  setupGracefulShutdown();
}

function setupGracefulShutdown() {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('═════════════════════════════════════════════════════════════');
    logger.info(`🛑 SHUTDOWN SIGNAL: ${signal}`);
    logger.info('═════════════════════════════════════════════════════════════');

    const timeout = setTimeout(() => {
      logger.error('[SHUTDOWN] ⚠️  Force shutdown - timeout exceeded');
      connections.forEach((conn) => conn.destroy());
      process.exit(1);
    }, 10000);

    try {
      // Stop new requests
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('[SHUTDOWN] ✅ HTTP server closed');
          resolve();
        });
      });

      // Close queues first (they use Redis)
      await closeQueues();
      logger.info('[SHUTDOWN] ✅ Message queues closed');

      // Then Redis
      await disconnectRedis();
      logger.info('[SHUTDOWN] ✅ Redis disconnected');

      // Then Mongo
      await mongoose.connection.close();
      logger.info('[SHUTDOWN] ✅ MongoDB disconnected');

      clearTimeout(timeout);
      logger.info('═════════════════════════════════════════════════════════════');
      logger.info('✅ SHUTDOWN COMPLETE - Goodbye!');
      logger.info('═════════════════════════════════════════════════════════════');
      process.exit(0);
    } catch (err) {
      logger.error('[SHUTDOWN] ❌ Shutdown error', err);
      process.exit(1);
    }
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, shutdown);
  });

  process.on('uncaughtException', (err) => {
    logger.error('[EXCEPTION] Uncaught exception', err);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('[REJECTION] Unhandled rejection', reason);
    shutdown('unhandledRejection');
  });
}

bootstrap();
