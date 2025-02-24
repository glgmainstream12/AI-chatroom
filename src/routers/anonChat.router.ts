import { Router } from "express";
import { AnonymousChatController, anonymousLimiter } from "../controllers/anonChat.controller";

const router = Router();

/**
 * Apply rate limiting to all anonymous chat routes
 */
router.use(anonymousLimiter);

/**
 * POST /anon/conversation
 * Create a new anonymous conversation
 */
router.post("/conversation", AnonymousChatController.createConversation);

/**
 * GET /anon/conversation/:conversationId/messages
 * Get messages from an anonymous conversation
 */
router.get(
  "/conversation/:conversationId/messages",
  AnonymousChatController.getConversationMessages
);

/**
 * POST /anon/conversation/:conversationId/message
 * Add a user message to an anonymous conversation
 */
router.post(
  "/conversation/:conversationId/message",
  AnonymousChatController.addAnonymousMessage
);

/**
 * DELETE /anon/conversation/:conversationId
 * Reset (delete) an anonymous conversation
 */
router.delete(
  "/conversation/:conversationId",
  AnonymousChatController.resetConversation
);

/**
 * GET /anon/conversation/:conversationId/stream
 * Stream AI responses for anonymous users
 * Query params:
 *   - model: "gpt-3.5-turbo" | "sonar-reasoning-pro" (default: "gpt-3.5-turbo")
 */
router.get(
  "/conversation/:conversationId/stream",
  AnonymousChatController.streamAnonymousCompletion
);

/**
 * POST /anon/cleanup
 * Cleanup old anonymous conversations (admin only)
 * Query params:
 *   - maxAge: number (hours, default: 24)
 */
// router.post(
//   "/cleanup",
//   // This route should be protected by admin middleware in production
//   AnonymousChatController.cleanupOldConversations
// );

export default router;