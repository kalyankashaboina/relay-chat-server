import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getAllUsers } from "./user.controller";

const router = Router();

router.get("/", requireAuth, getAllUsers);

export default router;
