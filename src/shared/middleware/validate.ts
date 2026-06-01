import type { Request, Response, NextFunction } from 'express';
import type { AnyZodObject, ZodError, ZodEffects } from 'zod';

import { AppError } from '../errors/AppError';
import { logger } from '../logger';

type ValidationSource = 'body' | 'query' | 'params';
type ValidatableSchema = AnyZodObject | ZodEffects<AnyZodObject>;

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

export function validate(schema: ValidatableSchema, source: ValidationSource = 'body') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req[source]);
      req[source] = validated as (typeof req)[typeof source];
      next();
    } catch (error) {
      const zodError = error as ZodError;
      if (zodError?.name === 'ZodError') {
        const formatted = zodError.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        logger.warn('[VALIDATION] Failed', { source, errors: formatted, path: req.path });
        return next(
          new AppError(`Validation failed: ${formatted.map((e) => e.message).join(', ')}`, 400)
        );
      }
      next(error);
    }
  };
}

export function validateMultiple(schemas: Partial<Record<ValidationSource, ValidatableSchema>>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors: Array<{ source: string; field: string; message: string }> = [];
    try {
      for (const [source, schema] of Object.entries(schemas)) {
        if (!schema) continue;
        try {
          const validated = await schema.parseAsync(req[source as ValidationSource]);
          req[source as ValidationSource] = validated as (typeof req)[ValidationSource];
        } catch (error) {
          const zodError = error as ZodError;
          if (zodError?.name === 'ZodError') {
            zodError.errors.forEach((e) =>
              errors.push({ source, field: e.path.join('.'), message: e.message })
            );
          } else throw error;
        }
      }
      if (errors.length > 0) {
        logger.warn('[VALIDATION] Multi-source failed', { errors, path: req.path });
        return next(
          new AppError(
            `Validation failed: ${errors.map((e) => `${e.source}.${e.field}: ${e.message}`).join(', ')}`,
            400
          )
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateFileUpload(options: {
  maxSize?: number;
  allowedTypes?: string[];
  required?: boolean;
}) {
  return (req: MulterRequest, _res: Response, next: NextFunction): void => {
    const { file } = req;
    const { maxSize, allowedTypes, required = true } = options;

    if (required && !file) return next(new AppError('File upload is required', 400));
    if (!file) return next();
    if (maxSize && file.size > maxSize)
      return next(new AppError(`File exceeds maximum size of ${maxSize} bytes`, 400));
    if (allowedTypes && !allowedTypes.includes(file.mimetype))
      return next(
        new AppError(
          `File type ${file.mimetype} is not allowed. Allowed: ${allowedTypes.join(', ')}`,
          400
        )
      );
    next();
  };
}

export function isZodError(error: unknown): error is ZodError {
  return (error as ZodError)?.name === 'ZodError';
}

export function formatZodError(error: ZodError) {
  const errors = error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
    code: e.code,
  }));
  return {
    message: `Validation failed: ${errors.map((e) => e.message).join(', ')}`,
    errors,
  };
}
