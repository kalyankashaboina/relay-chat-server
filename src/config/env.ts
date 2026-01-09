import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 4000,
  MONGO_URI: process.env.MONGO_URI as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8081',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

if (!env.MONGO_URI) throw new Error('MONGO_URI missing');
if (!env.JWT_SECRET) throw new Error('JWT_SECRET missing');
