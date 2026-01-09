import { Schema, model, Types } from 'mongoose';

/**
 * Plaintext Message schema (NON-E2EE)
 */
const MessageSchema = new Schema(
  {
    /* ================= RELATIONS ================= */

    conversationId: {
      type: Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },

    senderId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /* ================= PAYLOAD ================= */

    content: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },

    attachments: [
      {
        name: String,
        mimeType: String,
        size: Number,
        url: String,
      },
    ],

    /* ================= DELIVERY / READ ================= */

    deliveredTo: [
      {
        type: Types.ObjectId,
        ref: 'User',
      },
    ],

    readBy: [
      {
        type: Types.ObjectId,
        ref: 'User',
      },
    ],

    /* ================= EDIT / DELETE ================= */

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

/* ================= INDEXES ================= */

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = model('Message', MessageSchema);
