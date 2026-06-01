import { Types } from 'mongoose';
import { User } from '../user.model';

export const userRepository = {
  findById: (id: string) =>
    User.findById(id).select('-password -passwordResetToken -passwordResetExpires').lean(),

  // Paginated user search excluding self — uses compound index (username text, _id cursor)
  searchExcluding: (
    excludeId: Types.ObjectId,
    query: string | undefined,
    cursor: Types.ObjectId | null,
    limit: number
  ) => {
    const match: Record<string, unknown> = { _id: { $ne: excludeId } };
    if (query) match.$text = { $search: query };
    if (cursor) match._id = { ...(match._id as object), $lt: cursor };
    return User.find(match)
      .select('_id username email avatar isOnline')
      .sort(query ? { score: { $meta: 'textScore' } } : { username: 1 })
      .limit(limit + 1)
      .lean();
  },

  findByUsernameRegex: (regex: RegExp) => User.find({ username: regex }).select('_id').lean(),

  updateById: (id: string, updates: Record<string, unknown>) =>
    User.findByIdAndUpdate(id, updates, { new: true }).select(
      '-password -passwordResetToken -passwordResetExpires'
    ),
};
