// ─────────────────────────────────────────────────────────────────────────────
// config/performance.ts
// Performance settings. No Redis references.
// ─────────────────────────────────────────────────────────────────────────────
import compression from 'compression';
import type { Express, Request, Response } from 'express';

export const mongooseOptions = {
  maxPoolSize: 5,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  maxIdleTimeMS: 30000,
  retryWrites: true,
  retryReads: true,
  maxConnecting: 2,
} as const;

export const socketConfig = {
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'] as string[],
  perMessageDeflate: false,
} as const;

export function setupCompression(app: Express): void {
  app.use(
    compression({
      level: 6,
      threshold: 1024,
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    })
  );
}

export function monitorMemory(): void {
  setInterval(() => {
    const used = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    console.log('Memory Usage:', {
      rss: `${mb(used.rss)} MB`,
      heapUsed: `${mb(used.heapUsed)} MB`,
    });
    if (mb(used.rss) > 400) {
      console.warn('WARNING - Memory usage high:', `${mb(used.rss)} MB / 512 MB`);
    }
  }, 60000);
}

export function setupCleanupJobs(): void {
  // Placeholder for periodic cleanup tasks (e.g. pruning old messages)
  setInterval(() => {
    // Future: clean up expired vanish-mode messages, old scheduled messages, etc.
  }, 3600000);
}
