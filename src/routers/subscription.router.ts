// server/routes/subscription.router.ts
import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller";
// import any auth middlewares as needed
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

/**
 * POST /subscription/create
 * Body: { planType, amount }
 * Creates a subscription record, calls Midtrans, returns Snap token/redirect
 */
router.post("/create", requireAuth, SubscriptionController.createSubscriptionPayment);

/**
 * POST /subscription/notification
 * Midtrans Notification Endpoint
 */
router.post("/notification", SubscriptionController.handleMidtransNotification);

export default router;