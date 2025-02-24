// server/services/chatService.ts
import { Response } from "express";
import prisma from "../prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";
import { getAIProviderForModel } from "../model/aiProviders";
import { TokenTrackingService } from "./tokenTracing.service";

/**
 * DBMessage represents the shape of your Prisma "Message" model row.
 */
export interface DBMessage {
  id: string;
  conversationId: string;
  role: string; // "user" | "assistant" | "system"
  content: string;
  createdAt?: Date;
}

/**
 * ChatMessage is the shape you pass to AI providers.
 * Note that Anthropic and others require "user" | "assistant" only;
 * you may map "system" to "assistant".
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface LocalStorageChat {
  id: string;
  messages: ChatMessage[];
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Additional local-only interface
export interface LocalConversation {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
}

// Enhanced ChatService
export class ChatService {
  private static LOCAL_STORAGE_KEY = 'local_conversations';

  /**
   * Get or create a conversation, either locally or in DB.
   */
  static async getOrCreateConversation(
    conversationId?: string,
    userId?: string,
    isLocalOnly: boolean = false
  ) {
    if (isLocalOnly) {
      if (!conversationId) {
        // Create new local conversation
        const newConversation: LocalConversation = {
          id: crypto.randomUUID(),
          userId: userId || "",
          messages: [],
          createdAt: new Date()
        };
        this.saveLocalConversation(newConversation);
        return newConversation;
      }

      // Get existing local conversation
      const conversation = this.getLocalConversation(conversationId);
      if (conversation) return conversation;

      // Create new local conversation with provided ID
      const newLocal: LocalConversation = {
        id: conversationId,
        userId: userId || "",
        messages: [],
        createdAt: new Date()
      };
      this.saveLocalConversation(newLocal);
      return newLocal;
    }

    // ------ Original DB logic -------
    if (!conversationId) {
      return await prisma.conversation.create({
        data: { userId: userId || "" },
      });
    }

    let conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          id: conversationId,
          userId: userId || "",
        },
      });
    }
    return conversation;
  }

  /**
   * Add a user message
   */
  static async addUserMessage(
    conversationId: string,
    content: string,
    isLocalOnly: boolean = false
  ) {
    if (isLocalOnly) {
      const conversation = this.getLocalConversation(conversationId);
      if (!conversation) throw new Error("Conversation not found");

      const message: ChatMessage = {
        role: "user",
        content,
        timestamp: new Date()
      };

      conversation.messages.push(message);
      this.saveLocalConversation(conversation);
      return message;
    }

    // ---- DB logic ----
    console.log("[ChatService] addUserMessage =>", { conversationId, content });
    return await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content,
      },
    });
  }

  /**
   * Add an assistant message
   */
  static async addAssistantMessage(
    conversationId: string,
    content: string,
    isLocalOnly: boolean = false
  ) {
    if (isLocalOnly) {
      const conversation = this.getLocalConversation(conversationId);
      if (!conversation) throw new Error("Conversation not found");

      const message: ChatMessage = {
        role: "assistant",
        content,
        timestamp: new Date()
      };

      conversation.messages.push(message);
      this.saveLocalConversation(conversation);
      return message;
    }

    // ---- DB logic ----
    console.log("[ChatService] addAssistantMessage =>", { conversationId });
    return await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content,
      },
    });
  }

  /**
   * Retrieve messages from local or DB
   */
  static async getMessagesForConversation(
    conversationId: string,
    isLocalOnly: boolean = false
  ) {
    if (isLocalOnly) {
      const conversation = this.getLocalConversation(conversationId);
      return conversation?.messages || [];
    }

    console.log("[ChatService] getMessagesForConversation =>", conversationId);
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Reset (delete) a conversation
   */
  static async resetConversation(conversationId: string, isLocalOnly: boolean = false) {
    if (isLocalOnly) {
      this.deleteLocalConversation(conversationId);
      return;
    }

    console.log("[ChatService] resetConversation =>", conversationId);
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });
  }

  /**
   * Retrieve all conversations, locally or DB
   */
  static async getAllConversations(isLocalOnly: boolean = false) {
    if (isLocalOnly) {
      return this.getAllLocalConversations();
    }

    console.log("[ChatService] getAllConversations => DB");
    try {
      return await prisma.conversation.findMany({
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      console.error("[ChatService] getAllConversations error:", error);
      throw new Error("Failed to retrieve conversations.");
    }
  }

  /**
   * **SSE**: Streams chat completion from chosen AI model.
   */
  static async streamChatCompletion(
    req: AuthRequest,
    res: Response,
    conversationId: string,
    onToken: (token: string) => void,
    model = "gpt-4o",
    isLocalOnly: boolean = false
  ): Promise<void> {
    console.log("[ChatService] streamChatCompletion =>", { conversationId, model });
    const messages = await this.getMessagesForConversation(conversationId, isLocalOnly);

    if (!messages.length) {
      console.log("[ChatService] No previous messages found.");
    }

    // Convert to ChatMessage
    const chatMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      timestamp: new Date()  // or m.createdAt || new Date()
    }));

    const provider = getAIProviderForModel(model);

    let totalTokens = 0;
    let assistantContent = "";

    // 1) Stream from the provider
    totalTokens = await provider.streamCompletion(chatMessages, model, (partialToken) => {
      assistantContent += partialToken;
      onToken(partialToken); // SSE write callback
    });

    // 2) If there's an assistant response, track usage & save
    if (assistantContent.trim().length > 0) {
      try {
        if (req.user?.id) {
          // track usage => may throw if AI service not found
          await TokenTrackingService.trackTokenUsage(
            req.user.id,
            model,
            totalTokens,
            messages[messages.length - 1]?.content
          );
        }
      } catch (tokenErr) {
        console.error("[ChatService] trackTokenUsage error:", tokenErr);
        // Optional: you can re-throw if you want the controller to handle it
        // throw tokenErr;
        // OR just log & continue if usage tracking is non-critical
      }

      await this.addAssistantMessage(conversationId, assistantContent, isLocalOnly);
      console.log("[ChatService] Assistant message saved. tokens used:", totalTokens);
    } else {
      console.log("[ChatService] Assistant returned empty content.");
    }
  }

  // ---------------------------------------
  // Local storage helper methods
  // ---------------------------------------
  private static getLocalConversation(conversationId: string): LocalConversation | null {
    const conversations = this.getAllLocalConversations();
    return conversations.find(conv => conv.id === conversationId) || null;
  }

  private static getAllLocalConversations(): LocalConversation[] {
    try {
      const data = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("[ChatService] Error reading local conversations:", error);
      return [];
    }
  }

  private static saveLocalConversation(conversation: LocalConversation) {
    const conversations = this.getAllLocalConversations();
    const index = conversations.findIndex(conv => conv.id === conversation.id);
    
    if (index !== -1) {
      conversations[index] = conversation;
    } else {
      conversations.push(conversation);
    }

    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(conversations));
  }

  private static deleteLocalConversation(conversationId: string) {
    const conversations = this.getAllLocalConversations();
    const filtered = conversations.filter(conv => conv.id !== conversationId);
    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  }
}