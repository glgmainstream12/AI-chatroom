// server/routes/anonymousChat.router.ts
import { Router } from "express";
import { AnonymousChatController } from "../controllers/anonChat.controller";

const router = Router();

/**
 * POST /anon/conversation
 * - Create a new anonymous conversation
 */
router.post("/conversation", AnonymousChatController.createConversation);

/**
 * GET /anon/conversation/:conversationId/messages
 * - Get messages from an anonymous conversation
 */
router.get("/conversation/:conversationId/messages", AnonymousChatController.getConversationMessages);

/**
 * POST /anon/conversation/:conversationId/message
 * - Add a user message (checks usage count)
 */
router.post("/conversation/:conversationId/message", AnonymousChatController.addAnonymousMessage);

/**
 * DELETE /anon/conversation/:conversationId
 * - Reset (delete) conversation from DB
 */
router.delete("/conversation/:conversationId", AnonymousChatController.resetConversation);

/**
 * GET /anon/conversation/:conversationId/stream?model=gpt-4o
 * - Stream AI responses from GPT-3.5 or GPT-4
 */
router.get("/conversation/:conversationId/stream", AnonymousChatController.streamAnonymousCompletion);

export default router;