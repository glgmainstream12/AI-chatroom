// auth.router.ts
import { Router, RequestHandler } from "express";
import {
  signUp,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPasswordHandler,
  authLimiter
} from "../controllers/auth.controller";
import { requireAuth, AuthRequest } from "../middlewares/auth.middleware";

const router = Router();

// Apply rate limiting to auth endpoints
router.use(authLimiter);

// Public routes
router.post("/sign-up", signUp);
router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPasswordHandler);

// Protected routes
router.post("/logout", requireAuth as RequestHandler, logout);

export default router;