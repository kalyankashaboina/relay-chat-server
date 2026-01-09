import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../../config/env";
import { User } from "../users/user.model";
import { AppError } from "../../shared/errors/AppError";

/* ===============================
   Register
================================ */

export async function register(
  username: string,
  email: string,
  password: string
) {
  const normalizedEmail = email.toLowerCase();

  const existingUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { username }],
  });

  if (existingUser) {
    throw new AppError("User already exists", 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
    email: normalizedEmail,
    password: hashedPassword,
  });

  return user;
}

/* ===============================
   Login
================================ */

export async function login(email: string, password: string) {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = jwt.sign(
    { userId: user._id.toString() },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return token;
}

/* ===============================
   Forgot Password
================================ */

export async function forgotPassword(email: string) {
  const user = await User.findOne({ email });

  // NEVER reveal if user exists
  if (!user) return;

  const resetToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 min

  await user.save();

  // TODO: send email via mail service
  // mailService.sendResetPassword(email, resetToken);

  console.log("Password reset token (DEV ONLY):", resetToken);
}

/* ===============================
   Reset Password
================================ */

export async function resetPassword(
  token: string,
  newPassword: string
) {
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("Token is invalid or expired", 400);
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();
}
