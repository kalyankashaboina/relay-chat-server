import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../users/user.model";


export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
      console.log("Incoming request headers:", req.headers);
    console.log("Incoming request cookies:", req.cookies);
    const token = req.cookies?.relay_token;

    if (!token) {
      console.log("No token provided");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as { userId: string };

    const user = await User.findById(payload.userId).select("-password");

    if (!user) {
      console.log("User not found");
      return res.status(401).json({ message: "Unauthorized" });
    }

    (req as any).user = user;
    next();
  }  catch (err) {
    console.error("Unexpected error in requireAuth middleware:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
