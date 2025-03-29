// server/middlewares/rateLimit.middleware.ts
import { RequestHandler } from "express";
import prisma from "../prisma/client";
import { differenceInMinutes } from "date-fns";
import { AuthRequest } from "./auth.middleware";

export const rateLimit: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const authReq = req as AuthRequest;

    // Ensure the request is authenticated
    if (!authReq.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Fetch the user from the database
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    

    // Premium users have no rate limit
    if (
      user.planType === "PRO_DAILY" ||
      user.planType === "PRO_WEEKLY" ||
      user.planType === "PRO_MONTHLY" ||
      user.planType === "PRO_MONTHLY_SUBSCRIPTION"
    ) {
      return next(); // skip rate limiting
    }

    // Free or Student users are limited to 15 prompts per 30 minutes
    const maxAllowed = 10;

    // Check if token usage should be reset
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

    // if (user.tokenUsed >= maxAllowed) {
    //   res.status(429).json({
    //     error: "Rate limit exceeded. Please wait 30 minutes or upgrade.",
    //   });
    //   return;
    // }

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
    return;
  }
};