import http from 'http';
import mongoose from 'mongoose';

import { app } from './app';
import { env } from './config/env';
import { connectMongo } from './db/mongo';
import { initSocket } from './modules/socket';
import { monitorMemory, setupCleanupJobs } from './config/performance';
import { startScheduledMessageJob } from './jobs/scheduledMessage.job';
import { logger } from './shared/utils/logger';

let server: http.Server;
let isShuttingDown = false;

const connections = new Set<ReturnType<http.Server['on']>>();

async function bootstrap() {
  logger.info('─────────────────────────────────────');
  logger.info('🚀 RELAY CHAT SERVER - STARTING');
  logger.info('─────────────────────────────────────');

  try {
    await connectMongo();
    logger.info('[STARTUP] ✅ MongoDB connected');
  } catch (err) {
    logger.error('[STARTUP] ❌ MongoDB connection failed', err);
    process.exit(1);
  }

  server = http.createServer(app);
  server.on('connection', (conn) => {
    connections.add(conn as unknown as ReturnType<http.Server['on']>);
    (conn as { on: (e: string, cb: () => void) => void }).on('close', () =>
      connections.delete(conn as unknown as ReturnType<http.Server['on']>)
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, '0.0.0.0', () => {
      const base = `http://localhost:${env.PORT}`;
      logger.info('─────────────────────────────────────');
      logger.info('✅ SERVER RUNNING');
      logger.info(`📡 API:       ${base}`);
      logger.info(`🔌 Socket:    ws://localhost:${env.PORT}`);
      logger.info(`🏥 Health:    ${base}/health`);
      logger.info('─────────────────────────────────────');
      resolve();
    });
  });

  const io = initSocket(server);
  startScheduledMessageJob(io);
  if (env.NODE_ENV !== 'production') monitorMemory();
  setupCleanupJobs();
  setupGracefulShutdown();
}

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`🛑 SHUTDOWN: ${signal}`);

    const timeout = setTimeout(() => {
      logger.error('[SHUTDOWN] Force shutdown - timeout exceeded');
      process.exit(1);
    }, 10000);

    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mongoose.connection.close();
      clearTimeout(timeout);
      logger.info('✅ SHUTDOWN COMPLETE');
      process.exit(0);
    } catch (err) {
      logger.error('[SHUTDOWN] Error', err);
      process.exit(1);
    }
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

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
