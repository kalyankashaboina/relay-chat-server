import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import { AppError } from "../../shared/errors/AppError";

/**
 * Register
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      throw new AppError(
        "Username, email and password are required",
        400
      );
    }

    await authService.register(username, email, password);

    res.status(201).json({
      message: "User registered successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Login
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError("Email and password are required", 400);
    }

    const token = await authService.login(email, password);

    res.cookie("relay_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "Login successful",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get current authenticated user
 */
export async function me(req: Request, res: Response) {
  return res.status(200).json((req as any).user);
}

/**
 * Logout
 */
export async function logout(req: Request, res: Response) {
  res.clearCookie("relay_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  res.status(200).json({
    message: "Logged out successfully",
  });
}
