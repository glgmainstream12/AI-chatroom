// server/middlewares/rateLimit.middleware.ts
import { RequestHandler } from "express";
import prisma from "../prisma/client";
import { differenceInMinutes } from "date-fns";
import { AuthRequest } from "./auth.middleware";

// For visitors: a simple in-memory map of ip => { count, lastResetAt }
const visitorUsageMap = new Map<string, { count: number; lastResetAt: Date }>();

export const rateLimit: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    // 1) If no user => treat as visitor
    if (!authReq.user) {
      const visitorIp = req.ip || "unknown_ip";

      if (!visitorUsageMap.has(visitorIp)) {
        visitorUsageMap.set(visitorIp, { count: 0, lastResetAt: new Date() });
      }
      const visitorData = visitorUsageMap.get(visitorIp)!;

      const minutesSinceReset = differenceInMinutes(
        new Date(),
        visitorData.lastResetAt
      );

      if (minutesSinceReset >= 30) {
        visitorData.count = 0;
        visitorData.lastResetAt = new Date();
      }

      if (visitorData.count >= 5) {
        res.status(429).json({ error: "Visitor rate limit exceeded. Please wait or login." });
        return; // ✅ Ensure we return void
      }

      visitorData.count++;
      next();
      return; // ✅ Ensure void return
    }

    // 2) Authenticated user => fetch from DB
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Plan logic
    if (user.planType === "PREMIUM") {
      next();
      return;
    }

    // Free or Student => 15 prompts / 30 min
    const maxAllowed = 15;

    // Check if we should reset usage
    const shouldReset =
      !user.tokenResetAt ||
      differenceInMinutes(new Date(), user.tokenResetAt) >= 30;

    if (shouldReset) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          tokenUsed: 0,
          tokenResetAt: new Date(),
        },
      });
      user.tokenUsed = 0;
    }

    if (user.tokenUsed >= maxAllowed) {
      res.status(429).json({
        error: "Rate limit exceeded. Please wait 30 minutes or upgrade.",
      });
      return;
    }

    // Increment usage
    await prisma.user.update({
      where: { id: user.id },
      data: {
        tokenUsed: { increment: 1 },
      },
    });

    next();
  } catch (error) {
    console.error("[rateLimit] Error:", error);
    res.status(500).json({ error: "Internal server error" });
    return; // ✅ Ensure we return void
  }
};