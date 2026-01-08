import { Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  console.warn(
    `[404] ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
}
