import type { Types, Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IConversation extends Document {
  type: 'direct' | 'group';
  name?: string;
  avatar?: string;
  createdBy?: Types.ObjectId;
  admins?: Types.ObjectId[];
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  unreadCounts?: { userId: Types.ObjectId; count: number }[];
  mutedBy?: Types.ObjectId[];
  archivedBy?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    name: { type: String, trim: true },
    avatar: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
    unreadCounts: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 },
      },
    ],
    mutedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    archivedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Sidebar load: participants filtered, sorted by updatedAt desc
ConversationSchema.index({ participants: 1, updatedAt: -1 });
// Direct chat lookup between exactly two users
ConversationSchema.index({ type: 1, participants: 1 });
// Group name search + mute/archive lookups
ConversationSchema.index({ name: 'text' });
ConversationSchema.index({ mutedBy: 1 }, { sparse: true });
ConversationSchema.index({ archivedBy: 1 }, { sparse: true });

export const Conversation = model<IConversation>('Conversation', ConversationSchema);
