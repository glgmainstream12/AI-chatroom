import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { getAIProviderForModel } from "../model/aiProviders";
import { 
  ANONYMOUS_USER_ID, 
  MAX_MESSAGES_PER_CONVERSATION, 
  MAX_CONTENT_LENGTH, 
  ALLOWED_MODELS, 
  AllowedModel 
} from "../model/anonChat.config";

// Initialize Prisma
const prisma = new PrismaClient();

/**
 * Anonymous Chat Service
 * Handles AI-powered anonymous conversations.
 */
export class AnonymousChatService {
  /**
   * Create a new anonymous conversation.
   */
  static async createConversation() {
    try {
      const conversationId = crypto.randomUUID();

      // Create conversation
      const conversation = await prisma.conversation.create({
        data: { id: conversationId, userId: ANONYMOUS_USER_ID },
      });

      // Add system message
      await prisma.message.create({
        data: {
          conversationId,
          role: "system",
          content: "New anonymous conversation started.",
        },
      });

      return conversation;
    } catch (error) {
      console.error("[AnonymousChatService] createConversation error:", error);
      throw new Error("Failed to create anonymous conversation");
    }
  }

  /**
   * Retrieve an anonymous conversation by ID.
   */
  static async getConversation(conversationId: string) {
    try {
      return await prisma.conversation.findFirst({
        where: { id: conversationId, userId: ANONYMOUS_USER_ID },
        include: { Message: true },
      });
    } catch (error) {
      console.error("[AnonymousChatService] getConversation error:", error);
      throw new Error("Failed to retrieve conversation");
    }
  }

  /**
   * Retrieve messages from an anonymous conversation.
   */
  static async getMessages(conversationId: string) {
    try {
      return await prisma.message.findMany({
        where: { conversationId, Conversation: { userId: ANONYMOUS_USER_ID } },
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      console.error("[AnonymousChatService] getMessages error:", error);
      throw new Error("Failed to retrieve messages");
    }
  }

  /**
   * Add a user message to an anonymous conversation.
   */
  static async addUserMessage(conversationId: string, content: string) {
    try {
      if (content.length > MAX_CONTENT_LENGTH) {
        throw new Error(`Message too long. Max ${MAX_CONTENT_LENGTH} characters.`);
      }

      // Check rate limits
      const messageCount = await prisma.message.count({
        where: { conversationId, Conversation: { userId: ANONYMOUS_USER_ID } },
      });

      if (messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
        throw new Error("Max messages reached. Start a new conversation.");
      }

      return await prisma.message.create({
        data: { conversationId, role: "user", content: content.trim() },
      });
    } catch (error) {
      console.error("[AnonymousChatService] addUserMessage error:", error);
      throw error;
    }
  }

  /**
   * Add an assistant message to an anonymous conversation.
   */
  static async addAssistantMessage(conversationId: string, content: string) {
    try {
      return await prisma.message.create({
        data: { conversationId, role: "assistant", content: content.trim() },
      });
    } catch (error) {
      console.error("[AnonymousChatService] addAssistantMessage error:", error);
      throw new Error("Failed to save assistant message");
    }
  }

  /**
   * Reset an anonymous conversation.
   */
  static async resetConversation(conversationId: string) {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) throw new Error("Conversation not found or not anonymous");

      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversation.delete({ where: { id: conversationId } });
    } catch (error) {
      console.error("[AnonymousChatService] resetConversation error:", error);
      throw error;
    }
  }

  /**
   * Stream chat completion for anonymous users (only allowed models).
   */
  static async streamAnonymousCompletion(
    conversationId: string,
    model: AllowedModel,
    onToken: (token: string) => void
  ) {
    try {
      console.log("[AnonymousChatService] Streaming completion...");
      console.log("[Model] Selected model:", model);

      // Validate model
      if (!ALLOWED_MODELS.includes(model)) {
        throw new Error("Invalid model for anonymous chat.");
      }

      // Fetch messages
      const messages = await this.getMessages(conversationId);
      if (!messages.length) throw new Error("No messages found.");

      // Transform DB messages to AI format
      const formattedMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
        timestamp: new Date()
      }));

      // Get AI provider for the selected model
      const provider = getAIProviderForModel(model);

      // Stream response
      let assistantBuffer = "";
      const totalTokens = await provider.streamCompletion(formattedMessages, model, (token) => {
        assistantBuffer += token;
        onToken(token);
      });

      // Store assistant response if not empty
      if (assistantBuffer.trim()) {
        await this.addAssistantMessage(conversationId, assistantBuffer);
      }

      console.log("[AnonymousChatService] Streaming complete.");
      return totalTokens;
    } catch (error) {
      console.error("[AnonymousChatService] streamAnonymousCompletion error:", error);
      throw error;
    }
  }

  /**
   * Clean up old anonymous conversations (default: older than 24 hours).
   */
  static async cleanupOldConversations(maxAgeHours = 24) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

      // Delete old messages
      await prisma.message.deleteMany({
        where: { Conversation: { userId: ANONYMOUS_USER_ID, createdAt: { lt: cutoffDate } } },
      });

      // Delete old conversations
      const { count } = await prisma.conversation.deleteMany({
        where: { userId: ANONYMOUS_USER_ID, createdAt: { lt: cutoffDate } },
      });

      return count;
    } catch (error) {
      console.error("[AnonymousChatService] cleanupOldConversations error:", error);
      throw new Error("Failed to cleanup old conversations.");
    }
  }
}