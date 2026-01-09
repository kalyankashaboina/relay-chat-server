import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { env } from '../../config/env';
import { User } from '../users/user.model';

interface ListUsersParams {
  currentUserId: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export async function register(email: string, password: string) {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('User already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    email,
    password: hashedPassword,
  });

  return user;
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const token = jwt.sign({ userId: user._id.toString() }, env.JWT_SECRET, { expiresIn: '7d' });

  return token;
}

export async function listUsers({ currentUserId, q, cursor, limit = 20 }: ListUsersParams) {
  const query: any = {
    _id: { $ne: new Types.ObjectId(currentUserId) },
  };

  // 🔍 Search (optional)
  if (q && q.trim() !== '') {
    query.$or = [
      { username: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }

  // 📄 Cursor pagination
  if (cursor) {
    query._id = {
      ...query._id,
      $gt: new Types.ObjectId(cursor),
    };
  }

  const users = await User.find(query)
    .sort({ _id: 1 })
    .limit(limit + 1) // fetch one extra to detect hasMore
    .select('_id username email avatar isOnline')
    .lean();

  const hasMore = users.length > limit;
  const sliced = hasMore ? users.slice(0, limit) : users;

  return {
    data: sliced.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email,
      avatar: u.avatar,
      isOnline: u.isOnline,
    })),
    nextCursor: hasMore ? sliced[sliced.length - 1]._id.toString() : null,
    hasMore,
  };
}
