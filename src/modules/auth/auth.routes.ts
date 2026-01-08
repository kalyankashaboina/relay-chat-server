import { Router } from "express";
import { register, login, logout, me } from "./auth.controller";
import { requireAuth } from "./auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// protected route
router.get("/me", requireAuth, me);

export default router;
