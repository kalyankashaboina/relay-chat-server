import { Router } from "express";
import {
  register,
  login,
  logout,
  me,
  forgotPassword,
  resetPassword,
} from "./auth.controller";
import { requireAuth } from "./auth.middleware";

const router = Router();

//    Public routes

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

//    Protected routes

router.get("/me", requireAuth, me);

export default router;
