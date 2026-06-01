import mongoose from 'mongoose';

import { createExpressApp } from './modules/http/express';
import authRoutes from './modules/auth/auth.routes';
import conversationRoutes from './modules/conversations/conversation.routes';
import userRoutes from './modules/users/user.routes';
import messageRoutes from './modules/messages/message.routes';
import uploadRoutes from './modules/upload/upload.routes';
import { notFound } from './shared/middleware/notFound';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './shared/middleware/errorHandler';
import { logger } from './shared/utils/logger';

const app = createExpressApp();

// ── Request logging ───────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('[REQUEST]', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
});

// ── Health checks ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/readiness', (_req, res) => {
  const mongo = mongoose.connection.readyState === 1;
  const ok = mongo;
  res.status(ok ? 200 : 500).json({ status: ok ? 'ready' : 'not_ready', mongo });
});

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', messageRoutes);

app.get('/', (_req, res) => {
  res.json({ message: 'Relay Chat API', version: '1.0.0' });
});

setupSwagger(app);

// ── Error handling ────────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

export { app };
