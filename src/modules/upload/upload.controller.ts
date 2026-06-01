import path from 'path';
import crypto from 'crypto';

import type { Request, Response } from 'express';

import { env } from '../../config/env';
import { logger } from '../../shared/logger';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

type CloudinaryResourceType = 'image' | 'video' | 'raw';

async function uploadToCloudinary(
  buffer: Buffer,
  _originalName: string,
  mimeType: string
): Promise<{ url: string; id: string }> {
  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });

  const resourceType: CloudinaryResourceType = mimeType.startsWith('video/')
    ? 'video'
    : mimeType.startsWith('image/')
      ? 'image'
      : 'raw';

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: 'relay-chat', resource_type: resourceType }, (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve({ url: result.secure_url, id: result.public_id });
      })
      .end(buffer);
  });
}

function localFallback(buffer: Buffer, originalName: string): { url: string; id: string } {
  const base64 = buffer.toString('base64');
  const ext = path.extname(originalName).toLowerCase();

  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
  };

  const mime = mimeMap[ext] ?? 'application/octet-stream';
  const id = crypto.randomBytes(8).toString('hex');

  return { url: `data:${mime};base64,${base64.slice(0, 50000)}`, id };
}

export async function uploadFile(req: MulterRequest, res: Response) {
  try {
    const { file } = req;

    if (!file) return res.status(400).json({ success: false, message: 'No file provided' });

    let result: { url: string; id: string };

    if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
      result = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype);
      logger.info('File uploaded to Cloudinary', { id: result.id });
    } else {
      result = localFallback(file.buffer, file.originalname);
      logger.info('File stored as data URL (dev mode — configure Cloudinary for production)');
    }

    return res.status(201).json({
      success: true,
      url: result.url,
      id: result.id,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });
  } catch (err) {
    logger.error('Upload error', { error: (err as Error).message });
    return res.status(500).json({ success: false, message: 'Upload failed' });
  }
}
