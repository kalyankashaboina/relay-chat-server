import { Request, Response } from "express";
import { User } from "./user.model";

export async function getAllUsers(req: Request, res: Response) {
  try {
    const currentUserId = (req as any).user._id;

    const users = await User.find({
      _id: { $ne: currentUserId }, // exclude self
    })
      .select("_id username email avatar isOnline")
      .lean();

    res.json({
      data: users.map((u) => ({
        id: u._id,
        username: u.username,
        email: u.email,
        avatar: u.avatar,
        isOnline: u.isOnline,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
}
