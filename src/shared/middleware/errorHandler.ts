import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Always log full error internally
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl}`
  );
  console.error(err);

  // Expected / operational errors
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Programming / unknown errors
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}
