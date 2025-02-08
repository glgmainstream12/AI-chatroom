// server/services/subscription.service.ts
import axios from "axios";
import prisma from "../prisma/client";
import midtransClient from "midtrans-client";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

export class SubscriptionService {
  /**
   * Create a subscription or fetch existing if pending, then call Midtrans Snap API
   * to get a transaction token and redirect URL.
   */
  static async createSubscriptionPayment(
    userId: string,
    planType: PlanType,
    amount: number
  ) {
    // 1) Create a new Subscription record with status PENDING (or fetch existing one)
    //    Typically you'd do upsert or some logic to see if there's an existing PENDING sub.
    const subscriptionId = uuidv4(); // e.g. "536fba6d-..."
    const orderId = `SUB-${subscriptionId}-${Date.now()}`;
    const now = new Date(); 
    const subscription = await prisma.subscription.create({
        data: {
          id: subscriptionId,
          orderId,
          userId,
          planType,
          amount,
          status: SubscriptionStatus.PENDING,
          updatedAt: now,
        },
      });

    // 2) Build the payload for Midtrans
    //    - We generate a unique order_id from subscription.id or subscription.orderId
    //    - planType could appear in item_details as well
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "CHANGE_ME";
    const body = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount, // total price
      },
      // item_details is optional but recommended for clarity
      item_details: [
        {
          id: planType,
          price: amount,
          quantity: 1,
          name: `Subscription ${planType}`,
        },
      ],
      customer_details: {
        // fetch user info if needed
      },
      credit_card: {
        secure: true,
      },
    };

    // 3) Call Midtrans Snap API via Axios
    const url = "https://app.sandbox.midtrans.com/snap/v1/transactions";
    const authHeader = Buffer.from(`${serverKey}:`).toString("base64"); // Basic <base64(serverKey:)>

    const response = await axios.post(url, body, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
    });

    const { token, redirect_url } = response.data;

    // 4) Update subscription with the generated orderId and paymentToken
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        orderId: orderId, // store that unique order id
        paymentToken: token,
      },
    });

    // 5) Return the relevant data
    return {
      subscription: updatedSubscription,
      snapToken: token,
      redirectUrl: redirect_url,
    };
  }

  /**
   * Handle Midtrans notification
   * - Verifies transaction status
   * - Updates subscription status
   * - Optionally, update user planType or subscriptionEnd
   */
  static async handleMidtransNotification(notificationBody: any) {
    // 1) Use midtrans-client's CoreApi to parse the notification
    const coreApi = new midtransClient.CoreApi({
      isProduction: false, // or true for production
      serverKey: process.env.MIDTRANS_SERVER_KEY || "",
      clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
    });

    const statusResponse = await coreApi.transaction.notification(
      notificationBody
    );
    const orderId = statusResponse.order_id; // "SUB-<subscriptionId>-<timestamp>"
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    // 2) Extract the subscriptionId from order_id
    //    e.g. "SUB-<subscriptionId>-<timestamp>"
    const splitted = orderId.split("-");
    if (splitted.length < 3) {
      throw new Error("Invalid order_id format");
    }
    const subscriptionId = splitted[1]; // The string between "SUB-" and "-timestamp"

    // 3) Fetch the subscription from DB
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { User: true }, // if you want user info
    });
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // 4) Determine the new subscription status
    let newStatus: SubscriptionStatus | null = null;

    if (transactionStatus === "settlement") {
      newStatus = SubscriptionStatus.ACTIVE;
    } else if (
      ["cancel", "expire", "deny"].includes(transactionStatus)
    ) {
      newStatus = SubscriptionStatus.FAILED;
    } else if (transactionStatus === "pending") {
      newStatus = SubscriptionStatus.PENDING;
    } else if (transactionStatus === "capture") {
      // If credit card transaction, might see "capture"
      if (fraudStatus === "accept") {
        newStatus = SubscriptionStatus.ACTIVE;
      } else if (fraudStatus === "challenge") {
        // Possibly still pending or under manual review
        newStatus = SubscriptionStatus.PENDING;
      }
    }

    if (newStatus) {
      // 5) Update the subscription in DB
      const updatedSub = await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: newStatus },
      });

      // 6) If subscription is now ACTIVE, you might want to:
      //    - update user.planType
      //    - set subscriptionEnd
      if (newStatus === SubscriptionStatus.ACTIVE) {
        // Example: set user planType to subscription's planType,
        // and extend subscriptionEnd by 30 days (or 1 year)
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

    // 7) If no recognized status, just return existing sub
    return subscription;
  }
}