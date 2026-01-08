import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { User } from "../users/user.model";
import { AppError } from "../../shared/errors/AppError";

/**
 * Register a new user
 */
export async function register(
  username: string,
  email: string,
  password: string
) {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    // Conflict
    throw new AppError("User already exists", 409);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
    email,
    password: hashedPassword,
  });

  return user;
}

/**
 * Login user and return JWT
 */
export async function login(email: string, password: string) {
  const user = await User.findOne({ email });

  // Same message for security reasons
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
