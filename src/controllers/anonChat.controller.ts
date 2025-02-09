// server/controllers/anonymousChat.controller.ts
import { Request, Response } from "express";
import { AnonymousChatService } from "../services/anonChat.service";
import rateLimit from "express-rate-limit";

// Rate limiting configuration for anonymous users
export const anonymousLimiter = rateLimit({
  windowMs: 1, // 15 minutes
  max: 20, // Limit each IP to 3 requests per window
  message: { error: "Rate limit exceeded. Please wait 15 minutes or sign in for more requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Bot detection using common bot user-agent strings
const BOT_USER_AGENTS = [
  'bot', 'crawler', 'spider', 'scraper', 'wget', 'curl',
  // 'postman',  // If we remove this, Postman won't be blocked
  'python-requests', 'ruby', 'java'
];

function isBotUserAgent(userAgent: string): boolean {
  return BOT_USER_AGENTS.some(bot => userAgent.toLowerCase().includes(bot));
}

export class AnonymousChatController {
  /**
   * Create a new conversation for an anonymous user
   * POST /anon/conversation
   */
  static async createConversation(req: Request, res: Response): Promise<void> {
    try {
      console.log("\n[DEBUG] === POST /anon/conversation ===");
      console.log("[DEBUG] Method:", req.method, "Path:", req.path);
      console.log("[DEBUG] Headers:", req.headers);
      console.log("[DEBUG] Session ID:", req.sessionID);
      console.log("[DEBUG] Request Body:", req.body);

      // Bot detection debug
      const userAgent = req.headers["user-agent"] || "";
      console.log("[DEBUG] User-Agent:", userAgent);
      if (!userAgent || isBotUserAgent(userAgent)) {
        console.log("[DEBUG] Request blocked due to bot detection.");
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const conversation = await AnonymousChatService.createConversation();
      console.log("[DEBUG] Conversation created:", conversation);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("[AnonymousChatController] createConversation error:", error);
      res.status(500).json({
        error: "Failed to create conversation",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get messages from an anonymous conversation
   * GET /anon/conversation/:conversationId/messages
   */
  static async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      console.log("\n[DEBUG] === GET /anon/conversation/:conversationId/messages ===");
      console.log("[DEBUG] Method:", req.method, "Path:", req.path);
      console.log("[DEBUG] Headers:", req.headers);
      console.log("[DEBUG] Session ID:", req.sessionID);
      console.log("[DEBUG] Request Params:", req.params);

      const { conversationId } = req.params;

      // Verify conversation exists and is anonymous
      console.log("[DEBUG] Fetching conversation:", conversationId);
      const conversation = await AnonymousChatService.getConversation(conversationId);
      console.log("[DEBUG] Conversation result:", conversation);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found or not anonymous" });
        return;
      }

      console.log("[DEBUG] Fetching messages for:", conversationId);
      const messages = await AnonymousChatService.getMessages(conversationId);
      console.log("[DEBUG] Messages count:", messages.length);
      res.json(messages);
    } catch (error) {
      console.error("[AnonymousChatController] getConversationMessages error:", error);
      res.status(500).json({
        error: "Failed to retrieve messages",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Add a user message to an anonymous conversation
   * POST /anon/conversation/:conversationId/message
   */
  static async addAnonymousMessage(req: Request, res: Response): Promise<void> {
    try {
      console.log("\n[DEBUG] === POST /anon/conversation/:conversationId/message ===");
      console.log("[DEBUG] Method:", req.method, "Path:", req.path);
      console.log("[DEBUG] Headers:", req.headers);
      console.log("[DEBUG] Session ID:", req.sessionID);
      console.log("[DEBUG] Request Params:", req.params);
      console.log("[DEBUG] Request Body:", req.body);

      const { conversationId } = req.params;
      const { content } = req.body;

      // Input validation
      if (!content || typeof content !== 'string') {
        console.log("[DEBUG] Missing or invalid content:", content);
        res.status(400).json({ error: "Message content is required and must be a string" });
        return;
      }

      // Verify conversation exists and is anonymous
      console.log("[DEBUG] Checking conversation existence for ID:", conversationId);
      const conversation = await AnonymousChatService.getConversation(conversationId);
      console.log("[DEBUG] Conversation result:", conversation);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found or not anonymous" });
        return;
      }

      console.log("[DEBUG] Adding user message to conversation:", conversationId);
      const message = await AnonymousChatService.addUserMessage(conversationId, content);
      console.log("[DEBUG] New message created:", message);

      res.status(201).json(message);
    } catch (error) {
      console.error("[AnonymousChatController] addAnonymousMessage error:", error);

      if (error instanceof Error) {
        if (error.message.includes("Maximum messages reached")) {
          res.status(429).json({ error: error.message });
          return;
        }
        if (error.message.includes("Message too long")) {
          res.status(400).json({ error: error.message });
          return;
        }
      }

      res.status(500).json({
        error: "Failed to add message",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Reset/delete an anonymous conversation
   * DELETE /anon/conversation/:conversationId
   */
  static async resetConversation(req: Request, res: Response): Promise<void> {
    try {
      console.log("\n[DEBUG] === DELETE /anon/conversation/:conversationId ===");
      console.log("[DEBUG] Method:", req.method, "Path:", req.path);
      console.log("[DEBUG] Headers:", req.headers);
      console.log("[DEBUG] Session ID:", req.sessionID);
      console.log("[DEBUG] Request Params:", req.params);

      const { conversationId } = req.params;

      // Verify conversation exists and is anonymous
      console.log("[DEBUG] Checking conversation existence for ID:", conversationId);
      const conversation = await AnonymousChatService.getConversation(conversationId);
      console.log("[DEBUG] Conversation result:", conversation);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found or not anonymous" });
        return;
      }

      console.log("[DEBUG] Resetting conversation:", conversationId);
      await AnonymousChatService.resetConversation(conversationId);
      res.json({ message: "Conversation reset successfully" });
    } catch (error) {
      console.error("[AnonymousChatController] resetConversation error:", error);
      res.status(500).json({
        error: "Failed to reset conversation",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Stream AI response for anonymous users
   * GET /anon/conversation/:conversationId/stream
   */
  static async streamAnonymousCompletion(req: Request, res: Response): Promise<void> {
    try {
      console.log("\n[DEBUG] === GET /anon/conversation/:conversationId/stream ===");
      console.log("[DEBUG] Method:", req.method, "Path:", req.path);
      console.log("[DEBUG] Headers:", req.headers);
      console.log("[DEBUG] Session ID:", req.sessionID);
      console.log("[DEBUG] Request Params:", req.params);
      console.log("[DEBUG] Query:", req.query);

      const { conversationId } = req.params;
      const requestedModel = (req.query.model as string) || "gpt-3.5-turbo";

      // Verify conversation exists and is anonymous
      console.log("[DEBUG] Checking conversation existence for ID:", conversationId);
      const conversation = await AnonymousChatService.getConversation(conversationId);
      console.log("[DEBUG] Conversation result:", conversation);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found or not anonymous" });
        return;
      }

      // Set up SSE headers
      console.log("[DEBUG] Setting SSE headers...");
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 30000);

      // Handle client disconnect
      req.on("close", () => {
        console.log("[DEBUG] Client disconnected from SSE");
        clearInterval(heartbeat);
        res.end();
      });

      console.log("[DEBUG] Invoking AnonymousChatService.streamAnonymousCompletion...");
      await AnonymousChatService.streamAnonymousCompletion(
        conversationId,
        requestedModel as "gpt-3.5-turbo" | "sonar-reasoning-pro",
        (token) => {
          // Each token chunk arrives here
          console.log("[DEBUG] Streaming token chunk:", token);
          res.write(`data: ${token}\n\n`);
        }
      );

      // End SSE
      clearInterval(heartbeat);
      res.end();
      console.log("[DEBUG] SSE stream completed for conversation:", conversationId);
    } catch (error) {
      console.error("[AnonymousChatController] streamAnonymousCompletion error:", error);
      
      // If headers haven't been sent yet, send error response
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to stream completion",
          details: error instanceof Error ? error.message : "Unknown error"
        });
      } else {
        // If streaming has started, send error event
        res.write(`data: {"error": "${error instanceof Error ? error.message : 'Stream error'}"}\n\n`);
        res.end();
      }
    }
  }

  /**
   * Cleanup old anonymous conversations (admin only)
   * POST /anon/cleanup?maxAge=24
   */
  static async cleanupOldConversations(req: Request, res: Response): Promise<void> {
    try {
      console.log("\n[DEBUG] === POST /anon/cleanup ===");
      console.log("[DEBUG] Method:", req.method, "Path:", req.path);
      console.log("[DEBUG] Headers:", req.headers);
      console.log("[DEBUG] Session ID:", req.sessionID);
      console.log("[DEBUG] Query:", req.query);

      const maxAgeHours = parseInt(req.query.maxAge as string) || 24;
      console.log("[DEBUG] Cleanup with maxAgeHours:", maxAgeHours);

      const count = await AnonymousChatService.cleanupOldConversations(maxAgeHours);
      console.log("[DEBUG] Deleted old conversations count:", count);

      res.json({ 
        message: "Cleanup completed successfully", 
        deletedCount: count 
      });
    } catch (error) {
      console.error("[AnonymousChatController] cleanupOldConversations error:", error);
      res.status(500).json({
        error: "Failed to cleanup old conversations",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}