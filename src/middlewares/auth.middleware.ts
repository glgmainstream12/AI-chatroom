// server/middlewares/auth.middleware.ts
import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient, PlanType } from "@prisma/client";

const prisma = new PrismaClient();
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || "CHANGE_ME";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    planType?: PlanType; // optional if not in token
    tokenUsed?: number;
    tokenResetAt?: Date | null;
  };
}

/**
 * requireAuth Middleware
 * 1) Verifies Bearer token.
 * 2) If invalid => 401, else attach decoded info to req.user.
 */
export const requireAuth: RequestHandler = (req, res, next): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "No token provided" });
    return; // Ensure we return void
  }

  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer" || !token) {
    res.status(401).json({ error: "Invalid authorization header format" });
    return;
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as {
      id: string;
      email: string;
      role: string;
    };

    // Cast the incoming req as AuthRequest so we can assign req.user
    (req as AuthRequest).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expired" });
      return;
    }
    res.status(401).json({ error: "Invalid token" });
  }
};

/**
 * requireRole Middleware
 * If user's role is not in roles => 403.
 */
export function requireRole(roles: string[]): RequestHandler {
  return (req, res, next): void => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(authReq.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}