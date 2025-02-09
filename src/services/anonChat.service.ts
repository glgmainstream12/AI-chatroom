import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import crypto from "crypto";

const prisma = new PrismaClient();

// Initialize OpenAI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

// Constants for anonymous chat limitations
const ANONYMOUS_USER_ID = "ANONYMOUS";
const MAX_MESSAGES_PER_CONVERSATION = 10;
const MAX_CONTENT_LENGTH = 500;
const ALLOWED_MODELS = ["gpt-3.5-turbo", "sonar-reasoning-pro"] as const;

type AllowedModel = typeof ALLOWED_MODELS[number];

export class AnonymousChatService {
  /**
   * Create a new anonymous conversation
   */
  static async createConversation() {
    try {
      // Generate a unique conversation ID
      const conversationId = crypto.randomUUID();

      // Create a new anonymous conversation
      const conversation = await prisma.conversation.create({
        data: {
          id: conversationId,
          userId: "ANONYMOUS",
        },
      });

      // Create a system message as the first message in the conversation
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
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
   * Get an anonymous conversation by ID
   */
  static async getConversation(conversationId: string) {
    try {
      return await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId: ANONYMOUS_USER_ID,
        },
        include: {
          Message: true,
        },
      });
    } catch (error) {
      console.error("[AnonymousChatService] getConversation error:", error);
      throw new Error("Failed to retrieve conversation");
    }
  }

  /**
   * Get messages from an anonymous conversation
   */
  static async getMessages(conversationId: string) {
    try {
      return await prisma.message.findMany({
        where: {
          conversationId,
          Conversation: {
            userId: ANONYMOUS_USER_ID,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    } catch (error) {
      console.error("[AnonymousChatService] getMessages error:", error);
      throw new Error("Failed to retrieve messages");
    }
  }

  /**
   * Add a user message to an anonymous conversation
   */
  static async addUserMessage(conversationId: string, content: string) {
    try {
      if (content.length > MAX_CONTENT_LENGTH) {
        throw new Error(
          `Message too long. Maximum ${MAX_CONTENT_LENGTH} characters allowed.`
        );
      }

      // Check message count for rate limiting
      const messageCount = await prisma.message.count({
        where: {
          conversationId,
          Conversation: {
            userId: ANONYMOUS_USER_ID,
          },
        },
      });

      if (messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
        throw new Error(
          "Maximum messages reached for this conversation. Please start a new one."
        );
      }

      return await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: content.trim(),
        },
      });
    } catch (error) {
      console.error("[AnonymousChatService] addUserMessage error:", error);
      throw error;
    }
  }

  /**
   * Add an assistant message to an anonymous conversation
   */
  static async addAssistantMessage(conversationId: string, content: string) {
    try {
      return await prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: content.trim(),
        },
      });
    } catch (error) {
      console.error("[AnonymousChatService] addAssistantMessage error:", error);
      throw new Error("Failed to save assistant message");
    }
  }

  /**
   * Reset/delete an anonymous conversation
   */
  static async resetConversation(conversationId: string) {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found or not anonymous");
      }

      // Delete all messages first
      await prisma.message.deleteMany({
        where: {
          conversationId,
        },
      });

      // Then delete the conversation
      await prisma.conversation.delete({
        where: {
          id: conversationId,
        },
      });
    } catch (error) {
      console.error("[AnonymousChatService] resetConversation error:", error);
      throw error;
    }
  }

  /**
   * Stream chat completion for anonymous users (only limited models allowed)
   */
  static async streamAnonymousCompletion(
    conversationId: string,
    model: AllowedModel,
    onToken: (token: string) => void
  ) {
    try {
      console.log("[DEBUG] Starting streamAnonymousCompletion...");
      console.log("[DEBUG] Requested model:", model);
      console.log("[DEBUG] Conversation ID:", conversationId);
  
      // Validate model
      if (!ALLOWED_MODELS.includes(model)) {
        console.error("[ERROR] Invalid model for anonymous chat:", model);
        throw new Error("Invalid model for anonymous chat");
      }
  
      // Fetch messages
      const messages = await this.getMessages(conversationId);
      console.log("[DEBUG] Retrieved messages count:", messages.length);
  
      // Check if messages exist
      if (!messages.length) {
        console.error("[ERROR] No messages found for conversation:", conversationId);
        throw new Error("No messages found in conversation");
      }
  
      // Format messages for AI request
      const formattedMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));
  
      console.log("[DEBUG] Formatted messages:", formattedMessages);
  
      // Determine client (Perplexity or OpenAI)
      const client = model === "sonar-reasoning-pro" ? perplexity : openai;
      console.log("[DEBUG] Using AI client:", model === "sonar-reasoning-pro" ? "Perplexity" : "OpenAI");
  
      // Request AI completion (Streaming)
      console.log("[DEBUG] Sending request to AI model:", model);
      const completion = await client.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: 0.7,
        stream: true,
        max_tokens: 150, // Limit response length for anonymous users
      });
  
      let assistantBuffer = "";
  
      // Read AI response tokens
      console.log("[DEBUG] Streaming response...");
      for await (const part of completion) {
        const token = part.choices?.[0]?.delta?.content ?? "";
        if (token) {
          console.log("[DEBUG] Received token:", token);
          assistantBuffer += token;
          onToken(token);
        }
      }
  
      // Log full response from AI
      console.log("[DEBUG] Final assistant response:", assistantBuffer);
  
      // Store response in the database
      if (assistantBuffer.trim()) {
        await this.addAssistantMessage(conversationId, assistantBuffer);
        console.log("[DEBUG] Assistant message saved successfully.");
      }
    } catch (error) {
      console.error("[AnonymousChatService] streamAnonymousCompletion error:", error);
      throw error;
    }
  }

  /**
   * Clean up old anonymous conversations
   * This should be run periodically (e.g., daily)
   */
  static async cleanupOldConversations(maxAgeHours = 24) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);

      await prisma.message.deleteMany({
        where: {
          Conversation: {
            userId: ANONYMOUS_USER_ID,
            createdAt: {
              lt: cutoffDate,
            },
          },
        },
      });

      const { count } = await prisma.conversation.deleteMany({
        where: {
          userId: ANONYMOUS_USER_ID,
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return count;
    } catch (error) {
      console.error(
        "[AnonymousChatService] cleanupOldConversations error:",
        error
      );
      throw new Error("Failed to cleanup old conversations");
    }
  }
}