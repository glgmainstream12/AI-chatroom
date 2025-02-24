// server/services/tokenTrackingService.ts
import prisma from "../prisma/client";
import { PrismaClient, AIService } from "@prisma/client";

/**
 * Pricing data for AI services.
 */
interface AIModelPricing {
  id: string;
  model: string;
  pricePerMtoken: number; // Price in USD per million tokens
}

/**
 * Local array mapping models to pricing.
 */
const AI_MODEL_PRICING: AIModelPricing[] = [
  { id: "gpt-4o", model: "gpt-4o", pricePerMtoken: 2.5 },
  { id: "sonar", model: "sonar-reasoning", pricePerMtoken: 8.0 },
  { id: "pplx70b", model: "pplx-70b-chat", pricePerMtoken: 7.0 },
  { id: "mixtral", model: "mixtral-8x7b-instruct", pricePerMtoken: 4.0 },
  { id: "claude-sonnet", model: "claude-3-sonnet", pricePerMtoken: 3.0 },
  { id: "claude-haiku", model: "claude-3-haiku", pricePerMtoken: 0.25 },
  { id: "gemini-pro", model: "gemini-pro", pricePerMtoken: 0.002 },
  { id: "deepseek-v3.5", model: "deepseek-v3.5", pricePerMtoken: 2.0 },
];

/**
 * Finds the AIService entry for a given model using a raw SQL query.
 */
const findAIService = async (model: string): Promise<AIService | null> => {
  console.log(`[TokenTrackingService] Searching AIService for model: ${model}`);

  const aiService = await prisma.$queryRaw<AIService[]>`
    SELECT * FROM "AIService"
    WHERE "modelEndpoints" @> '[{"model":"${model}"}]' ::jsonb
    LIMIT 1
  `;

  console.log("[TokenTrackingService] AI Service (RAW Query Result):", aiService);

  return aiService.length > 0 ? aiService[0] : null;
};

/**
 * The TokenTrackingService manages AI token usage tracking.
 */
export class TokenTrackingService {
  /**
   * Records token usage for a given AI model.
   */
  static async trackTokenUsage(
    userId: string,
    model: string,
    tokensUsed: number,
    prompt?: string
  ) {
    console.log(`[TokenTrackingService] trackTokenUsage => userId=${userId}, model=${model}, tokensUsed=${tokensUsed}`);

    try {
      // 🔥 Use `findAIService` instead of the old Prisma query
      const aiService = await findAIService(model);

      console.log("[TokenTrackingService] Retrieved AI Service:", aiService);

      if (!aiService) {
        throw new Error(`No AI service found for model: ${model}`);
      }

      // ✅ Check local pricing
      console.log(`[TokenTrackingService] Checking local pricing for: ${model}`);
      const pricing = AI_MODEL_PRICING.find((p) => p.model === model);
      if (!pricing) {
        throw new Error(`No pricing found for model: ${model}`);
      }
      console.log("[TokenTrackingService] Found pricing:", pricing);

      // ✅ Calculate cost
      const costInUSD = (tokensUsed / 1_000_000) * pricing.pricePerMtoken;
      console.log(`[TokenTrackingService] Cost calculated: ${costInUSD} USD`);

      // ✅ Create aIUsageLog
      console.log("[TokenTrackingService] Creating AI usage log...");
      const usageLog = await prisma.aIUsageLog.create({
        data: {
          id: `usage_${Date.now()}`,
          userId,
          aiServiceId: aiService.id,
          prompt,
          tokensUsed,
          responseTime: 0,
          status: "completed",
          cost: costInUSD,
        },
      });
      console.log("[TokenTrackingService] Created usage log:", usageLog);

      // ✅ Update user token usage
      console.log(`[TokenTrackingService] Updating user=${userId} usage stats...`);
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          totalTokensUsed: { increment: tokensUsed },
          totalCostUSD: { increment: costInUSD },
        },
      });
      console.log("[TokenTrackingService] Updated user:", updatedUser);

      return usageLog;
    } catch (error) {
      console.error("[TokenTrackingService] trackTokenUsage error:", error);
      throw error;
    }
  }

  /**
   * Retrieves a usage summary for a given user.
   */
  static async getUserUsageSummary(userId: string) {
    console.log(`[TokenTrackingService] getUserUsageSummary => userId=${userId}`);
    try {
      const usageLogs = await prisma.aIUsageLog.findMany({
        where: { userId },
        include: { AIService: true },
      });

      console.log("[TokenTrackingService] Found usage logs:", usageLogs.length);

      const summary = {
        totalTokens: 0,
        totalCostUSD: 0,
        usageByModel: new Map<string, { tokens: number; cost: number }>(),
      };

      usageLogs.forEach((log) => {
        summary.totalTokens += log.tokensUsed;

        const model = log.AIService.name;
        const pricing = AI_MODEL_PRICING.find((p) => p.model === model);
        if (pricing) {
          const cost = (log.tokensUsed / 1_000_000) * pricing.pricePerMtoken;
          summary.totalCostUSD += cost;

          const prev = summary.usageByModel.get(model) || { tokens: 0, cost: 0 };
          prev.tokens += log.tokensUsed;
          prev.cost += cost;
          summary.usageByModel.set(model, prev);
        }
      });

      console.log("[TokenTrackingService] Usage summary:", summary);
      return summary;
    } catch (error) {
      console.error("[TokenTrackingService] getUserUsageSummary error:", error);
      throw error;
    }
  }
}