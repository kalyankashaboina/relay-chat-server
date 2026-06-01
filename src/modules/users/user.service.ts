import { Types } from 'mongoose';

import { listUsersSchema, type ListUsersInput } from '../../shared/validators';

import { userRepository } from './repository/user.repository';

interface UserRow {
  _id: { toString(): string };
  username: string;
  email: string;
  avatar?: string;
  isOnline?: boolean;
}

export async function listUsers(raw: ListUsersInput) {
  const { currentUserId, q, cursor, limit } = listUsersSchema.parse(raw);

  const currentOid = new Types.ObjectId(currentUserId);
  const cursorOid = cursor ? new Types.ObjectId(cursor) : null;
  const rows = (await userRepository.searchExcluding(currentOid, q, cursorOid, limit)) as UserRow[];

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  return {
    data: sliced.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      name: u.username,
      email: u.email,
      avatar: u.avatar ?? '',
      isOnline: u.isOnline ?? false,
    })),
    nextCursor: hasMore ? sliced[sliced.length - 1]._id.toString() : null,
    hasMore,
  };
}
