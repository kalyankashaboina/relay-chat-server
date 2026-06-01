import { User } from '../../users/user.model';

export const authRepository = {
  findByEmail: (email: string) => User.findOne({ email: email.toLowerCase() }),

  findByEmailOrUsername: (email: string, username: string) =>
    User.findOne({
      $or: [
        ...(email ? [{ email: email.toLowerCase() }] : []),
        ...(username ? [{ username: username.toLowerCase() }] : []),
      ].filter(Boolean),
    }),

  // Uses sparse index on passwordResetToken + passwordResetExpires
  findByResetToken: (hashedToken: string) =>
    User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }),

  create: (data: {
    username: string;
    email: string;
    password?: string;
    provider: 'local' | 'google';
    googleId?: string;
    avatar?: string;
    isEmailVerified: boolean;
  }) => User.create({ ...data, email: data.email.toLowerCase() }),

  updateById: (id: string, updates: Record<string, unknown>) =>
    User.findByIdAndUpdate(id, updates, { new: true }),

  linkGoogle: (userId: string, googleId: string, avatar?: string) =>
    User.findByIdAndUpdate(userId, {
      googleId,
      provider: 'google',
      isEmailVerified: true,
      ...(avatar ? { avatar } : {}),
    }),
};
