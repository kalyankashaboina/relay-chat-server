import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    console.error(`[ENV ERROR] Missing required variable: ${name}`);
    process.exit(1);
  }
  return val;
}

function optionalEnv(name: string, fallback?: string): string {
  const val = process.env[name];
  return val && val.trim() !== '' ? val : fallback || '';
}

function warnEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    console.warn(`[ENV WARN] ${name} is not set`);
    return '';
  }
  return val;
}

const NODE_ENV = optionalEnv('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

export const env = {
  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV,

  // required
  MONGO_URI: requireEnv('MONGO_URI'),
  REDIS_URL: requireEnv('REDIS_URL'),

  // auth
  JWT_SECRET: isProd ? requireEnv('JWT_SECRET') : optionalEnv('JWT_SECRET', 'dev-secret'),
  JWT_EXPIRES_IN: optionalEnv('JWT_EXPIRES_IN', '7d'),
  JWT_REFRESH_SECRET: warnEnv('JWT_REFRESH_SECRET'),
  JWT_REFRESH_EXPIRES_IN: optionalEnv('JWT_REFRESH_EXPIRES_IN', '30d'),

  // frontend
  FRONTEND_URL: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  ALLOWED_ORIGINS: optionalEnv('ALLOWED_ORIGINS', 'http://localhost:5173'),

  // upload
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE) || 10485760,
  UPLOAD_DIR: optionalEnv('UPLOAD_DIR', './uploads'),

  // rate limit
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  RATE_LIMIT_MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // logging
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),

  // email
  SMTP_HOST: warnEnv('SMTP_HOST'),
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_USER: warnEnv('SMTP_USER'),
  SMTP_PASS: warnEnv('SMTP_PASS'),
  EMAIL_FROM: optionalEnv('EMAIL_FROM', 'noreply@relaychat.com'),

  // oauth
  GOOGLE_CLIENT_ID: warnEnv('GOOGLE_CLIENT_ID'),

  // cloudinary
  CLOUDINARY_CLOUD_NAME: warnEnv('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: warnEnv('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: warnEnv('CLOUDINARY_API_SECRET'),

  // webrtc
  STUN_SERVER: optionalEnv('STUN_SERVER', 'stun:stun.l.google.com:19302'),
  TURN_SERVER: warnEnv('TURN_SERVER'),
  TURN_USERNAME: warnEnv('TURN_USERNAME'),
  TURN_PASSWORD: warnEnv('TURN_PASSWORD'),
};