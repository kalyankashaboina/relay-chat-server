import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../shared/logger';

export async function connectMongo(): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', { error: err }));

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    retryWrites: true,
    retryReads: true,
  });

  logger.info('MongoDB connected', { uri: env.MONGO_URI.replace(/:\/\/[^@]+@/, '://***@') });
}
