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

      const conversation = await ChatService.getOrCreateConversation(
        conversationId,
        authReq.user?.id,
        false // isLocalOnly?
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

      const message = await ChatService.addUserMessage(conversationId, content, false);
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
      const messages = await ChatService.getMessagesForConversation(conversationId, false);
      res.json(messages);
    } catch (error) {
      console.error("[ChatController] Error in getMessagesForConversation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Reset (delete) a conversation
   */
  static resetConversation: RequestHandler = async (req, res) => {
    try {
      const { conversationId } = req.params;
      await ChatService.resetConversation(conversationId, false);
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
    const authReq = req as AuthRequest;
    const { conversationId } = req.params;
    const model = (req.query.model as string) || "gpt-4o";

    try {
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

      // Start streaming
      await ChatService.streamChatCompletion(
        authReq,
        res,
        conversationId,
        (token: string) => {
          console.log("[ChatController] Sending token to frontend:", token);
          // SSE data event
          res.write(`data: ${token}\n\n`);
        },
        model,
        false // isLocalOnly
      );

      // Done streaming => close
      res.end();
    } catch (error) {
      console.error("[ChatController] Error in streamChatCompletion:", error);
    
      // If no SSE data has been sent yet, we can still do a normal 500 JSON
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      } else {
        // SSE already started => send SSE error event or a final message
        // Narrow the type:
        const errorMessage = error instanceof Error ? error.message : String(error);
    
        res.write(`event: error\ndata: ${errorMessage}\n\n`);
        res.end();
      }
    }
  };

  /**
   * Get all conversations
   */
  static getAllConversations: RequestHandler = async (req, res) => {
    try {
      const conversations = await ChatService.getAllConversations(false);
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
        return;
      }

      // Check ownership
      if (conversation.userId !== authReq.user?.id) {
        res
          .status(403)
          .json({ error: "Forbidden: You do not own this conversation" });
        return;
      }

      res.json(conversation);
    } catch (error) {
      console.error("[ChatController] getConversationById error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}