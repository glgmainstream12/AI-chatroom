import { Router, RequestHandler } from "express";
import { ChatController } from "../controllers/chat.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { rateLimit } from "../middlewares/rateLimit.middleware";

const router = Router();

// Wrap (or cast) the middleware functions to satisfy the RequestHandler type.
// (If you prefer not to cast, consider modifying the middleware definitions so their return types are void.)
const authMiddleware: RequestHandler = (req, res, next) => requireAuth(req, res, next);
const roleMiddleware: RequestHandler = (req, res, next) => requireRole(["USER"])(req, res, next);
const rateLimitMiddleware: RequestHandler = (req, res, next) => rateLimit(req, res, next);

// Apply the middleware in the desired order:
router.use(authMiddleware);
router.use(roleMiddleware);
router.use(rateLimitMiddleware);

/**
 * GET /chat/conversation/:conversationId?
 * - If no conversationId is provided, creates a new conversation.
 * - Otherwise, returns the corresponding conversation.
 */
router.get("/conversation/:conversationId?", ChatController.getOrCreateConversation);

/**
 * POST /chat/conversation/:conversationId/message
 * - Adds a user message to the specified conversation.
 */
router.post("/conversation/:conversationId/message", ChatController.addUserMessage);

/**
 * GET /chat/conversation/:conversationId/messages
 * - Retrieves all messages for the specified conversation.
 */
router.get("/conversation/:conversationId/messages", ChatController.getMessagesForConversation);

/**
 * DELETE /chat/conversation/:conversationId
 * - Deletes (or resets) the specified conversation.
 */
router.delete("/conversation/:conversationId", ChatController.resetConversation);

/**
 * GET /chat/conversation/:conversationId/stream
 * - Streams AI responses (via SSE) for the conversation.
 */
router.get("/conversation/:conversationId/stream", ChatController.streamChatCompletion);

/**
 * GET /chat/conversations
 * - Retrieves all conversations (or possibly only the logged‑in user’s conversations).
 */
router.get("/conversations", ChatController.getAllConversations);

export default router;