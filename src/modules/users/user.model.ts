import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;

  username: string;      // unique display name
  avatar?: string;       // profile image
  isOnline: boolean;     // presence

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
      default: "",
    },

    isOnline: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const User = model<IUser>("User", UserSchema);
