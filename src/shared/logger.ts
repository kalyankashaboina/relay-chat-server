import pino from 'pino';
import { env } from '../config/env';

const isDev = env.NODE_ENV !== 'production';

const pinoLogger = pino(
  isDev
    ? {
        level: env.LOG_LEVEL || 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
            levelFirst: true,
            messageFormat: '{msg}',
          },
        },
      }
    : {
        level: env.LOG_LEVEL || 'info',
        formatters: { level: (label: string) => ({ level: label }) },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
);

function toMeta(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (value instanceof Error) return { err: value.message, stack: value.stack };
  if (typeof value === 'object') return value as Record<string, unknown>;
  return { value };
}

const wrap =
  (fn: (obj: Record<string, unknown>, msg: string) => void) => (msg: string, meta?: unknown) => {
    const obj = meta !== undefined ? toMeta(meta) : {};
    fn(obj, msg);
  };

export const logger = {
  debug: wrap(pinoLogger.debug.bind(pinoLogger)),
  info: wrap(pinoLogger.info.bind(pinoLogger)),
  warn: wrap(pinoLogger.warn.bind(pinoLogger)),
  error: wrap(pinoLogger.error.bind(pinoLogger)),
};
