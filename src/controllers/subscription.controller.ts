// server/controllers/subscription.controller.ts
import { Request, Response, NextFunction, RequestHandler } from "express";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { SubscriptionService } from "../services/subscription.service";

export class SubscriptionController {
  /**
   * Creates a subscription for a given plan, calls Midtrans to get Snap token & redirect URL
   */
  public static createSubscriptionPayment: RequestHandler = async (req, res, next) => {
    try {
      // 1) The userId is typically from req.user if you have JWT-based auth
      const userId = (req as any).user?.id; // Or whatever your auth logic sets
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      // 2) We expect planType & amount from body (or derive amount from planType)
      const { planType, amount } = req.body;
      if (!planType || !Object.values(PlanType).includes(planType)) {
        res.status(400).json({ error: "Invalid planType" });
        return;
      }
      if (!amount || typeof amount !== "number") {
        res.status(400).json({ error: "Invalid amount" });
        return;
      }

      // 3) Create subscription & get midtrans token
      const result = await SubscriptionService.createSubscriptionPayment(
        userId,
        planType,
        amount
      );

      res.json({
        success: true,
        subscription: result.subscription,
        snapToken: result.snapToken,
        redirectUrl: result.redirectUrl,
      });
      return; // make sure we return void
    } catch (error) {
      next(error);
    }
  };

  /**
   * Midtrans will send POST notifications to this endpoint.
   * We'll parse the transaction and update subscription status.
   */
  public static handleMidtransNotification: RequestHandler = async (req, res, next) => {
    try {
      const notification = req.body;
      const updatedSubscription = await SubscriptionService.handleMidtransNotification(notification);

      // Return 200 so Midtrans knows we handled it
      res.status(200).json({
        success: true,
        subscription: updatedSubscription,
      });
      return; // make sure we return void
    } catch (error) {
      next(error);
    }
  };
}