// server/controllers/anonymousChat.controller.ts
import { Request, Response } from "express";
import { AnonymousChatService } from "../services/anonChat.service";

/**
 * usageMap: sessionID => { count, lastReset }
 */
const usageMap = new Map<string, { count: number; lastReset: number }>();

function getUsageKey(req: Request): string {
  // We rely on express-session, which sets req.sessionID
  // If session is not set, express-session will create it automatically.
  return req.sessionID!;
}

function checkRateLimit(req: Request): boolean {
  const key = getUsageKey(req);

  if (!usageMap.has(key)) {
    usageMap.set(key, { count: 0, lastReset: Date.now() });
  }
  const usage = usageMap.get(key)!;
  const now = Date.now();
  const elapsed = now - usage.lastReset;

  // 15 minutes
  if (elapsed >= 15 * 60 * 1000) {
    usage.count = 0;
    usage.lastReset = now;
  }

  // Max 3 prompts per 15 minutes
  if (usage.count >= 3) {
    return false;
  }

  usage.count++;
  return true;
}

export class AnonymousChatController {
  /**
   * Create a new conversation for an anonymous user.
   * Example: POST /anon/conversation
   */
  static async createConversation(req: Request, res: Response): Promise<void> {
    try {
      // [Optional] Minimal anti-bot check with user-agent
      const userAgent = req.headers["user-agent"] || "";
      if (!userAgent || userAgent.toLowerCase().includes("bot")) {
        res.status(403).json({ error: "Detected as bot" });
        return;
      }

      const conv = await AnonymousChatService.createConversation();
      res.json(conv);
    } catch (error) {
      console.error("[AnonymousChatController] createConversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get messages from an anonymous conversation
   * Example: GET /anon/conversation/:conversationId/messages
   */
  static async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const conv = await AnonymousChatService.getConversation(conversationId);
      if (!conv) {
        res.status(404).json({ error: "Conversation not found or not anonymous." });
        return;
      }
      const messages = await AnonymousChatService.getMessages(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("[AnonymousChatController] getConversationMessages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Add a user message
   * Example: POST /anon/conversation/:conversationId/message
   */
  static async addAnonymousMessage(req: Request, res: Response): Promise<void> {
    try {
      // Rate limit check
      if (!checkRateLimit(req)) {
        res.status(429).json({ error: "Rate limit exceeded. Wait 15min or login." });
        return;
      }

      const { conversationId } = req.params;
      const { content } = req.body;

      if (!content) {
        res.status(400).json({ error: "Content is required" });
        return;
      }

      // Ensure conversation is anonymous
      const conv = await AnonymousChatService.getConversation(conversationId);
      if (!conv) {
        res.status(404).json({ error: "Conversation not found or not anonymous." });
        return;
      }

      const msg = await AnonymousChatService.addUserMessage(conversationId, content);
      res.json(msg);
    } catch (error) {
      console.error("[AnonymousChatController] addAnonymousMessage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Delete/reset conversation
   * Example: DELETE /anon/conversation/:conversationId
   */
  static async resetConversation(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const conv = await AnonymousChatService.getConversation(conversationId);
      if (!conv) {
        res.status(404).json({ error: "Conversation not found or not anonymous." });
        return;
      }

      await AnonymousChatService.resetConversation(conversationId);
      res.json({ message: "Conversation reset successfully" });
    } catch (error) {
      console.error("[AnonymousChatController] resetConversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Stream AI response (SSE) for GPT-3.5 or GPT-4 only
   * Example: GET /anon/conversation/:conversationId/stream?model=gpt-4o
   */
  static async streamAnonymousCompletion(req: Request, res: Response): Promise<void> {
    try {
      if (!checkRateLimit(req)) {
        res.status(429).json({ error: "Rate limit exceeded. Wait 15min or login." });
        return;
      }

      const { conversationId } = req.params;
      let model = (req.query.model as string) || "gpt-3.5-turbo";

      // Restrict to only gpt-3.5-turbo or gpt-4o
      if (model !== "gpt-3.5-turbo" && model !== "gpt-4o") {
        model = "gpt-3.5-turbo";
      }

      const conv = await AnonymousChatService.getConversation(conversationId);
      if (!conv) {
        res.status(404).json({ error: "Conversation not found or not anonymous." });
        return;
      }

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await AnonymousChatService.streamAnonymousCompletion(
        conversationId,
        model as "gpt-3.5-turbo" | "gpt-4o",
        (token) => {
          res.write(`data: ${token}\n\n`);
        }
      );

      res.end();
    } catch (error) {
      console.error("[AnonymousChatController] streamAnonymousCompletion:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}