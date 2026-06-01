import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/middleware/asyncHandler';

import { AppError } from '../../shared/errors/AppError';
import { HTTP, AUTH } from '../../shared/constants';
import { privacySettingsSchema, notificationPrefsSchema } from '../../shared/validators';

import { listUsers } from './user.service';
import { User } from './user.model';
import { updateProfile } from '../auth/auth.service';

// GET /api/users
export const getUsers = asyncHandler(async function getUsers(req: Request, res: Response) {
  const result = await listUsers({
    currentUserId: req.user!.userId,
    q: req.query.q as string | undefined,
    cursor: req.query.cursor as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
  });
  res.json({ success: true, ...result });
});

// PUT /api/users/me — delegates to auth.service.updateProfile (single source of truth)
export const updateMe = asyncHandler(async function updateMe(req: Request, res: Response) {
  const updated = await updateProfile(
    req.user!.userId,
    req.body as Parameters<typeof updateProfile>[1]
  );
  res.json({ success: true, data: updated });
});

// GET /api/users/me/privacy
export const getPrivacy = asyncHandler(async function getPrivacy(req: Request, res: Response) {
  const user = await User.findById(req.user!.userId).select('privacy').lean();
  if (!user) throw new AppError('User not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: user.privacy });
});

// PUT /api/users/me/privacy
export const updatePrivacy = asyncHandler(async function updatePrivacy(
  req: Request,
  res: Response
) {
  const parsed = privacySettingsSchema.parse(req.body);
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined) fields[`privacy.${k}`] = v;
  }
  const user = await User.findByIdAndUpdate(req.user!.userId, fields, { new: true })
    .select('privacy')
    .lean();
  if (!user) throw new AppError('User not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: user.privacy });
});

// GET /api/users/me/notifications
export const getNotificationPrefs = asyncHandler(async function getNotificationPrefs(
  req: Request,
  res: Response
) {
  const user = await User.findById(req.user!.userId).select('notificationPrefs').lean();
  if (!user) throw new AppError('User not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: user.notificationPrefs });
});

// PUT /api/users/me/notifications
export const updateNotificationPrefs = asyncHandler(async function updateNotificationPrefs(
  req: Request,
  res: Response
) {
  const parsed = notificationPrefsSchema.parse(req.body);
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined) fields[`notificationPrefs.${k}`] = v;
  }
  const user = await User.findByIdAndUpdate(req.user!.userId, fields, { new: true })
    .select('notificationPrefs')
    .lean();
  if (!user) throw new AppError('User not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: user.notificationPrefs });
});

// GET /api/users/me/blocked
export const getBlockedUsers = asyncHandler(async function getBlockedUsers(
  req: Request,
  res: Response
) {
  const user = await User.findById(req.user!.userId)
    .select('blockedUsers')
    .populate('blockedUsers', '_id username avatar email')
    .lean();
  if (!user) throw new AppError('User not found', HTTP.NOT_FOUND);
  res.json({ success: true, data: user.blockedUsers });
});

// POST /api/users/:id/block
export const blockUser = asyncHandler(async function blockUser(req: Request, res: Response) {
  const { id: targetId } = req.params;
  if (targetId === req.user!.userId) throw new AppError('Cannot block yourself', HTTP.BAD_REQ);
  await User.findByIdAndUpdate(req.user!.userId, { $addToSet: { blockedUsers: targetId } });
  res.json({ success: true, message: 'User blocked' });
});

// DELETE /api/users/:id/block
export const unblockUser = asyncHandler(async function unblockUser(req: Request, res: Response) {
  await User.findByIdAndUpdate(req.user!.userId, { $pull: { blockedUsers: req.params.id } });
  res.json({ success: true, message: 'User unblocked' });
});

// DELETE /api/users/me
export const deleteAccount = asyncHandler(async function deleteAccount(
  req: Request,
  res: Response
) {
  await User.findByIdAndDelete(req.user!.userId);
  // Use constant — never hardcode cookie name
  res.clearCookie(AUTH.COOKIE_NAME, { httpOnly: true, path: '/' });
  res.json({ success: true, message: 'Account deleted' });
});
