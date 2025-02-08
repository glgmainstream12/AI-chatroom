// server/services/chatService.ts
import OpenAI from "openai";
import prisma from "../prisma/client";
import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";

// Just a quick log to verify the presence of the API key. (Don't log the key itself in production!)
if (process.env.OPENAI_API_KEY) {
  console.log(
    "[ChatService] OPENAI_API_KEY is set (length:",
    process.env.OPENAI_API_KEY.length,
    ")"
  );
} else {
  console.log("[ChatService] No OPENAI_API_KEY found in environment variables!");
}

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize the Perplexity client
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

export class ChatService {
  /**
   * Retrieve or create a new Conversation by ID.
   * If conversationId is not provided or doesn't exist, we create a new one.
   * 
   * **Note:** This code assumes your Prisma schema for Conversation
   * has a `userId` field.
   */
  static async getOrCreateConversation(conversationId?: string, userId?: string) {
    if (!conversationId) {
      // Creating a new conversation with the current user's ID.
      const newConv = await prisma.conversation.create({
        data: {
          userId: userId || "", // ensure your schema requires a non-empty string or handle accordingly
        },
      });
      return newConv;
    }
  
    // If conversationId is provided, try to fetch it
    let conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
  
    if (!conversation) {
      // Create the conversation with the given conversationId and assign userId
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
   * Save the user's message to the DB.
   */
  static async addUserMessage(conversationId: string, content: string) {
    console.log(
      "[ChatService] addUserMessage => conversationId:",
      conversationId,
      " content:",
      content
    );

    const userMsg = await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: content,
      },
    });

    console.log("[ChatService] User message created with ID:", userMsg.id);
    return userMsg;
  }

  /**
   * Retrieve all messages for a conversation in ascending order.
   */
  static async getMessagesForConversation(conversationId: string) {
    console.log(
      "[ChatService] getMessagesForConversation => conversationId:",
      conversationId
    );

    const msgs = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    console.log(
      `[ChatService] Found ${msgs.length} messages in conversationId: ${conversationId}`
    );
    return msgs;
  }

  /**
   * Save the assistant's message to the DB.
   */
  static async addAssistantMessage(conversationId: string, content: string) {
    console.log(
      "[ChatService] addAssistantMessage => conversationId:",
      conversationId,
      " content length:",
      content.length
    );

    const assistantMsg = await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: content,
      },
    });

    console.log(
      "[ChatService] Assistant message created with ID:",
      assistantMsg.id
    );
    return assistantMsg;
  }

  /**
   * Delete all messages and the conversation itself (for "reset").
   */
  static async resetConversation(conversationId: string) {
    console.log("[ChatService] resetConversation => conversationId:", conversationId);
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });
    console.log("[ChatService] Conversation reset completed.");
  }

  /**
   * Stream a chat completion using the conversation's message history.
   * 
   * @param req The request (typed as AuthRequest so req.user exists)
   * @param res The response
   * @param conversationId The ID of the conversation
   * @param onToken Callback to receive each partial token (assistant content)
   * @param model The model to use (defaults to "gpt-4o")
   *
   * The method:
   * 1) Fetches existing messages from DB and transforms them for OpenAI.
   * 2) Calls the appropriate API with streaming enabled.
   * 3) Iterates over each chunk, calling `onToken(...)` with the partial content.
   * 4) Accumulates tokens and, once streaming ends, saves the final message in the DB.
   */
  static async streamChatCompletion(
    req: AuthRequest,
    res: Response,
    conversationId: string,
    onToken: (token: string) => void,
    model = "gpt-4o"
  ): Promise<void> {
    console.log("[ChatService] streamChatCompletion called with:", {
      conversationId,
      model,
    });
  
    const perplexityModels = ['sonar-reasoning-pro', 'pplx-70b-chat', 'mixtral-8x7b-instruct'];
    const openaiModels = ['gpt-4o', 'gpt-3.5-turbo'];
  
    const isPerplexity = perplexityModels.includes(model);
    const client = isPerplexity ? perplexity : openai;
    const currentUserId = req.user?.id || null;  // Now valid because req is typed as AuthRequest

    try {
      // 1) Fetch past messages from the database
      const messages = await this.getMessagesForConversation(conversationId);
      if (!messages.length) {
        console.log("[ChatService] No previous messages found.");
      }
  
      // 2) Format messages according to the selected API
      const formattedMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));
  
      console.log(
        `[ChatService] Sending ${isPerplexity ? "Perplexity" : "OpenAI"} request with model:`,
        model
      );
  
      // 3) Call the appropriate API with streaming enabled
      let completion;
      if (isPerplexity) {
        completion = await perplexity.chat.completions.create({
          model,
          messages: formattedMessages,
          temperature: 0.7,
          stream: true, // Enable response streaming
        });
      } else {
        completion = await openai.chat.completions.create({
          model,
          messages: formattedMessages,
          temperature: 0.7,
          stream: true, // Enable response streaming
        });
      }
  
      console.log(
        `[ChatService] ${isPerplexity ? "Perplexity" : "OpenAI"} response streaming started...`
      );
  
      let assistantContentBuffer = "";
  
      // 4) Read streamed response chunk by chunk
      for await (const part of completion) {
        const token = part.choices?.[0]?.delta?.content ?? "";
        if (token) {
          assistantContentBuffer += token;
          onToken(token); // Send each token to frontend
        }
      }
  
      // 5) If there's a response, save it to the database
      if (assistantContentBuffer.trim().length > 0) {
        await this.addAssistantMessage(conversationId, assistantContentBuffer);
        console.log("[ChatService] Assistant message saved.");
      } else {
        console.log("[ChatService] Assistant response was empty.");
      }
    } catch (error: any) {
      console.error(
        `[ChatService] Error while calling ${isPerplexity ? "Perplexity" : "OpenAI"}:`,
        error
      );
  
      if (error.response) {
        console.error("API error response:", error.response.data);
      }
  
      throw new Error(
        `Failed to fetch response from ${isPerplexity ? "Perplexity" : "OpenAI"}.`
      );
    }
  }

  /**
   * Returns all conversations in descending order of creation.
   * You could add filters (e.g., by userId) if needed.
   */
  static async getAllConversations() {
    try {
      const conversations = await prisma.conversation.findMany({
        orderBy: { createdAt: "desc" },
      });
      return conversations;
    } catch (error) {
      console.error("[ChatService] Error fetching all conversations:", error);
      throw new Error("Failed to retrieve conversations.");
    }
  }
}