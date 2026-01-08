import { Request, Response } from "express";
import { listUsers } from "./user.service";

export async function getUsers(req: Request, res: Response) {
  try {
    const currentUserId = (req as any).user._id;

    const { q, cursor, limit } = req.query;

    const result = await listUsers({
      currentUserId,
      q: q as string | undefined,
      cursor: cursor as string | undefined,
      limit: limit ? Number(limit) : 20,
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
}
