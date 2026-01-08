import { Schema, model, Types, Document } from "mongoose";

export interface IConversation extends Document {
  type: "direct" | "group";
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  unreadCounts?: {
    userId: Types.ObjectId;
    count: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },

    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    /**
     * Pointer to latest message
     * Used for sidebar preview
     */
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },

    /**
     * Per-user unread count
     */
    unreadCounts: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        count: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true, // 👈 you NEED updatedAt
  }
);

/**
 * Indexes
 */
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ updatedAt: -1 });

export const Conversation = model<IConversation>(
  "Conversation",
  ConversationSchema
);
