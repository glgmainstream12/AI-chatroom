// server/routes/subscription.router.ts
import { Router } from "express";
import { SubscriptionController } from "../controllers/subscription.controller";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();
+ // POST /subscription/create
+ // Body: { planType, paymentMethod? }
+ // Creates single-charge or recurring subscription
+ router.post("/create", requireAuth, SubscriptionController.createSubscriptionPayment);

// POST /subscription/notification
router.post("/notification", SubscriptionController.handleMidtransNotification);

export default router;