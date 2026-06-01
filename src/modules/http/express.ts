import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { env } from '../../config/env';
import { setupCompression } from '../../config/performance';
import { idempotency } from '../../shared/middleware/idempotency';

export function createExpressApp() {
  const app = express();

  // Security headers first
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: env.NODE_ENV === 'production',
    })
  );

  // CORS — origins from env, never hardcoded
  app.use(
    cors({
      origin: (origin, cb) => {
        const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
        if (!origin || allowed.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Idempotency-Key'],
    })
  );

  // Body parsing with size limits
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  setupCompression(app);

  // HTTP idempotency for mutating requests
  app.use(idempotency());

  // Trust proxy for rate limiting behind load balancers
  app.set('trust proxy', 1);

  return app;
}
