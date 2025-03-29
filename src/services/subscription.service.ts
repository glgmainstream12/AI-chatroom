// server/services/subscription.service.ts

import axios from "axios";
import prisma from "../prisma/client";
import midtransClient from "midtrans-client";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

export class SubscriptionService {
  /**
   * createProPayment:
   *  - If plan is daily/weekly/monthly => single-charge (/v2/charge) via Midtrans
   *  - If plan is monthly subscription => recurring via /v1/subscriptions
   */
  static async createProPayment(
    userId: string,
    planType: PlanType,
    paymentMethod?: string
  ) {
    // Determine price & allowed payment methods
    let price = 0;
    let isRecurring = false;

    switch (planType) {
      case PlanType.PRO_DAILY:
        price = 10000; // IDR 10,000
        // Only QRIS
        paymentMethod = "qris";
        break;
      case PlanType.PRO_WEEKLY:
        price = 50000; // IDR 50,000
        paymentMethod = "qris";
        break;
      case PlanType.PRO_MONTHLY:
        price = 100000; // IDR 100,000
        // default to qris if not specified
        paymentMethod = paymentMethod === "credit_card" ? "credit_card" : "qris";
        break;
      case PlanType.PRO_MONTHLY_SUBSCRIPTION:
        price = 90000; // IDR 90,000
        isRecurring = true;
        // default to "credit_card" if not specified
        if (paymentMethod !== "gopay") {
          paymentMethod = "credit_card";
        }
        break;
      default:
        // fallback or error
        throw new Error(`Unsupported planType: ${planType}`);
    }

    // If it's a single-charge scenario => use /v2/charge
    if (!isRecurring) {
      return await this.createSingleCharge(userId, planType, price, paymentMethod!);
    }
    // Else if it's subscription => use /v1/subscriptions
    else {
      return await this.createRecurringSubscription(userId, planType, price, paymentMethod!);
    }
  }

  /**
   * createSingleCharge => calls Midtrans /v2/charge for one-time payments
   */
  private static async createSingleCharge(
    userId: string,
    planType: PlanType,
    amount: number,
    paymentType: string
  ) {
    // 1) Create a record in "Subscription" table or a separate "Transaction" table
    const subscriptionId = uuidv4();
    const orderId = `${planType}-${subscriptionId}}`;

    // We'll store it in the Subscription table for convenience
    const subscription = await prisma.subscription.create({
      data: {
        id: subscriptionId,
        orderId,
        userId,
        planType,
        amount,
        status: SubscriptionStatus.PENDING,
      },
    });

    // 2) Build the midtrans /v2/charge payload
    // const serverKey = process.env.MIDTRANS_SERVER_KEY_BASE64;
    const authHeader = process.env.MIDTRANS_SERVER_KEY_BASE64;
    //  Buffer.from(`${serverKey}:`).toString("base64");
    // console.log("Auth header:", authHeader);

    // Payment type logic
    let body: any = {
      // payment_type: "qris",
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      }
    };

    if (paymentType === "qris") {
      body.payment_type = "qris";
      // For QRIS, typically "acquirer" = "gopay"
      body.qris = { acquirer: "gopay" };
    } else if (paymentType === "credit_card") {
      body.payment_type = "credit_card";
      body.credit_card = {
        secure: true,
      };
    } else {
      throw new Error(`Unsupported single-charge paymentType: ${paymentType}`);
    }

    const url = "https://api.sandbox.midtrans.com/v2/charge";
    const response = await axios.post(url, body, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
    });

    // 3) Save response info (if needed: qr_url, etc.)
    const midtransData = response.data;
    // Example: for QRIS, we might store midtransData.qris.qr_url
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        paymentToken: midtransData?.token || null, // or store transaction_id
      },
    });

    // 4) Return relevant data to frontend
    return {
      subscriptionId,
      orderId,
      status: SubscriptionStatus.PENDING,
      midtransResponse: midtransData,
    };
  }

  /**
   * createRecurringSubscription => calls Midtrans /v1/subscriptions
   * For "PRO_SUBSCRIPTION" with monthly recurring.
   * Payment method can be "credit_card" or "gopay" (needs extra setup).
   */
  private static async createRecurringSubscription(
    userId: string,
    planType: PlanType,
    amount: number,
    payMethod: string
  ) {
    // 1) Create subscription record in DB
    const subscriptionId = uuidv4();
    const now = new Date();
    const subscription = await prisma.subscription.create({
      data: {
        id: subscriptionId,
        orderId: subscriptionId, // or your format
        userId,
        planType,
        amount,
        status: SubscriptionStatus.PENDING,
      },
    });

    // 2) Build midtrans subscription payload
    // For credit_card or gopay recurring, you generally need a token or "payment_type"
    // This minimal example shows how you'd build it if you already have the card token.
    // const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const authHeader = process.env.MIDTRANS_SERVER_KEY_BASE64;

    const body: any = {
      name: "Pro Monthly Subscription",
      amount: amount.toString(),
      currency: "IDR",
      // "credit_card" or "gopay"
      payment_type: payMethod,
      token: "<some-card-token-or-gopay-token>",
      schedule: {
        interval: 1,
        interval_unit: "month",
        start_time: new Date(now.getTime() + 5_000).toISOString(), // e.g. start in 5s
      },
      metadata: {
        description: "Pro subscription plan",
      },
      customer_details: {
        first_name: "YourUser",
        email: "user@example.com",
        // ...
      },
    };

    const url = "https://api.sandbox.midtrans.com/v1/subscriptions";
    const response = await axios.post(url, body, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
    });

    const midtransData = response.data;
    // midtransData.id is the "subscription_id" in Midtrans
    const midtransSubscriptionId = midtransData.id; 

    // 3) Optionally store that ID in DB
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        // store subscription "id" from midtrans, or any token
        paymentToken: midtransSubscriptionId,
      },
    });

    return {
      subscriptionId,
      midtransSubscriptionId,
      midtransResponse: midtransData,
    };
  }

  /**
   * handleMidtransNotification => same as original,
   *  to update subscription status in DB, set user plan, etc.
   */
  static async handleMidtransNotification(notificationBody: any) {
    // ... same code as your existing logic ...
    if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
      throw new Error('MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY must be set');
    }
    const coreApi = new midtransClient.CoreApi({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
    });

    const statusResponse = await coreApi.transaction.notification(notificationBody);
    const orderId = statusResponse.order_id; // e.g., "PRO-PRO_DAILY-<uuid>-<timestamp>" or if subscription monthly "SUB-..."
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    // parse subscriptionId from order_id or from your storing logic
    // e.g. "PRO-PRO_MONTHLY-<uuid>-<timestamp>"
    const splitted = orderId.split("-");
    if (splitted.length < 3) {
      throw new Error("Invalid order_id format");
    }
    // splitted[2] might be your <uuid>, depending how you structured it.
    const subscriptionId = splitted[2]; 

    // fetch from DB
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { User: true },
    });
    if (!subscription) {
      throw new Error("Subscription not found in DB");
    }

    // determine new status
    let newStatus: SubscriptionStatus | null = null;
    if (transactionStatus === "settlement") {
      newStatus = SubscriptionStatus.ACTIVE;
    } else if (["cancel", "expire", "deny"].includes(transactionStatus)) {
      newStatus = SubscriptionStatus.FAILED;
    } else if (transactionStatus === "pending") {
      newStatus = SubscriptionStatus.PENDING;
    } else if (transactionStatus === "capture") {
      if (fraudStatus === "accept") {
        newStatus = SubscriptionStatus.ACTIVE;
      } else if (fraudStatus === "challenge") {
        newStatus = SubscriptionStatus.PENDING;
      }
    }

    if (newStatus) {
      const updatedSub = await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: newStatus },
      });

      // If now active, optionally update user's planType & subscriptionEnd
      if (newStatus === SubscriptionStatus.ACTIVE) {
        const oneMonthFromNow = new Date();
        oneMonthFromNow.setDate(oneMonthFromNow.getDate() + 30);

        await prisma.user.update({
          where: { id: subscription.userId },
          data: {
            planType: subscription.planType,
            subscriptionEnd: oneMonthFromNow,
          },
        });
      }
      return updatedSub;
    }

    return subscription;
  }
}