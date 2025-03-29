// server/controllers/subscription.controller.ts

import { Request, Response } from "express";
import { SubscriptionService } from "../services/subscription.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { PlanType } from "@prisma/client";

export class SubscriptionController {
  /**
   * Create a new subscription/payment. 
   * - e.g. daily, weekly, monthly single-charge, or a recurring subscription
   * - Body typically includes { planType, paymentMethod } 
   */
  static async createSubscriptionPayment(req: Request, res: Response): Promise<void> {
    try {
      // Cast request to AuthRequest if you rely on req.user
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { planType, paymentMethod } = req.body;

      // Validate planType if you have multiple plan enums
      if (!planType) {
        res.status(400).json({ error: "planType is required" });
        return;
      }
      if (!Object.values(PlanType).includes(planType)) {
        res.status(400).json({ error: `Invalid planType: ${planType}` });
        return;
      }

      // Create the subscription or single-charge payment
      const result = await SubscriptionService.createProPayment(
        authReq.user.id,
        planType as PlanType,
        paymentMethod
      );

      // Return the relevant data (e.g., Snap token or subscription info)
      res.json(result);
    } catch (error: any) {
      console.error("[SubscriptionController] createSubscriptionPayment error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  /**
   * Handle Midtrans notification (e.g. settlement, pending, cancel, etc.)
   * - Typically called by Midtrans webhook
   */
  static async handleMidtransNotification(req: Request, res: Response): Promise<void> {
    try {
      // Pass the request body to your service method
      const updatedSubscription = await SubscriptionService.handleMidtransNotification(req.body);

      // Return a simple response to acknowledge
      res.json({ status: "ok", updatedSubscription });
    } catch (error: any) {
      console.error("[SubscriptionController] handleMidtransNotification error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  }
}