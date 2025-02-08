// server/controllers/chat.controller.ts
import { RequestHandler } from "express";
import { PrismaClient } from "@prisma/client";
import { ChatService } from "../services/chat.service";
import { AuthRequest } from "../middlewares/auth.middleware";

const prisma = new PrismaClient();

export class ChatController {
  /**
   * GET or CREATE a conversation
   */
  static getOrCreateConversation: RequestHandler = async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { conversationId } = req.params;

      // Pass the logged-in user's id if available
      const conversation = await ChatService.getOrCreateConversation(
        conversationId,
        authReq.user?.id
      );
      res.json(conversation);
    } catch (error) {
      console.error("[ChatController] Error in getOrCreateConversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Add a user message
   */
  static addUserMessage: RequestHandler = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { content } = req.body;

      if (!content) {
        res.status(400).json({ error: "Content is required" });
        return;
      }

      const message = await ChatService.addUserMessage(conversationId, content);
      res.json(message);
    } catch (error) {
      console.error("[ChatController] Error in addUserMessage:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Get all messages in a conversation
   */
  static getMessagesForConversation: RequestHandler = async (req, res) => {
    try {
      const { conversationId } = req.params;
      const messages = await ChatService.getMessagesForConversation(
        conversationId
      );
      res.json(messages);
    } catch (error) {
      console.error(
        "[ChatController] Error in getMessagesForConversation:",
        error
      );
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Reset (delete) a conversation
   */
  static resetConversation: RequestHandler = async (req, res) => {
    try {
      const { conversationId } = req.params;
      await ChatService.resetConversation(conversationId);
      res.json({ message: "Conversation reset successfully" });
    } catch (error) {
      console.error("[ChatController] Error in resetConversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Stream AI completion (SSE)
   */
  static streamChatCompletion: RequestHandler = async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { conversationId } = req.params;
      const model = (req.query.model as string) || "gpt-4o";

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      console.log(
        "[ChatController] Streaming AI response for conversation:",
        conversationId,
        "using model:",
        model
      );

      await ChatService.streamChatCompletion(
        authReq,
        res,
        conversationId,
        (token: string) => {
          console.log("[ChatController] Sending token to frontend:", token);
          res.write(`data: ${token}\n\n`);
        },
        model
      );

      res.end();
    } catch (error) {
      console.error("[ChatController] Error in streamChatCompletion:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Get all conversations
   */
  static getAllConversations: RequestHandler = async (req, res) => {
    try {
      const conversations = await ChatService.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("[ChatController] Error in getAllConversations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Get single conversation by ID (ensuring ownership)
   */
  static getConversationById: RequestHandler = async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { conversationId } = req.params;

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return; // Explicitly return void
      }

      // Check ownership
      if (conversation.userId !== authReq.user?.id) {
        res
          .status(403)
          .json({ error: "Forbidden: You do not own this conversation" });
        return; // Explicitly return void
      }

      res.json(conversation);
    } catch (error) {
      console.error("[ChatController] getConversationById error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}