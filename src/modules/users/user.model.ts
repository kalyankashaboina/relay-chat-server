import type { Document } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  username: string;
  avatar?: string;
  isOnline: boolean;

  passwordResetToken?: string;
  passwordResetExpires?: number;

  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },

    avatar: {
      type: String,
      default: '',
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    passwordResetToken: {
      type: String,
    },

    passwordResetExpires: {
      type: Number,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export const User = model<IUser>('User', UserSchema);
