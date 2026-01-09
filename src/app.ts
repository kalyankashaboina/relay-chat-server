import { createExpressApp } from './modules/http/express';
import authRoutes from './modules/auth/auth.routes';
import conversationRoutes from './modules/conversations/conversation.routes';
import userRoutes from './modules/users/user.routes';
import messageRoutes from './modules/messages/message.routes';
import { notFound } from './shared/middleware/notFound';
import { errorHandler } from './shared/middleware/errorHandler';
import { logger } from './shared/logger';

const app = createExpressApp();

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);

app.use('/api/users', userRoutes);
app.use('/api', messageRoutes);

app.get('/api', (req, res) => {
  res.send('Welcome to the API. Use /auth, /conversations, /users, or /messages endpoints.');
});

app.get('/', (req, res) => {
  logger.info('Root endpoint accessed');
  res.send('Hello! This is the server. Visit /api for API endpoints.');
});

app.use(notFound);

// global error handler (LAST)
app.use(errorHandler);

export { app };
