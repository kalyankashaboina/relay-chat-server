import winston from 'winston';
import 'winston-mongodb';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';
const mongoUri = process.env.MONGO_URI;

/**
 * Dev-friendly format
 */
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  return `${timestamp} [${level}]: ${stack ?? message} ${
    Object.keys(meta).length ? JSON.stringify(meta) : ''
  }`;
});

const transports: winston.transport[] = [];

/**
 * Console logs (ALWAYS ON)
 * Required for Docker / cloud platforms
 */
transports.push(
  new winston.transports.Console({
    format: isProduction ? combine(timestamp(), json()) : combine(colorize(), devFormat),
  }),
);

/**
 * Local file logs (DEV ONLY)
 */
if (!isProduction) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/app.log',
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
  );
}

/**
 * Database logs (PRODUCTION ONLY)
 */
if (isProduction) {
  if (!mongoUri) {
    console.log('MONGO_URI is not set. Skipping MongoDB logging.');
    throw new Error('MONGO_URI is required for production logging');
  }

  transports.push(
    new winston.transports.MongoDB({
      db: mongoUri,
      collection: 'logs',
      level: 'info',
      tryReconnect: true,
      options: {
        useUnifiedTopology: true,
      },
    }),
  );
}

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(timestamp(), errors({ stack: true })),
  transports,
});
