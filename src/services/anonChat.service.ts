// server/services/anonymousChat.service.ts
import OpenAI from "openai";
import prisma from "../prisma/client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

export class AnonymousChatService {
  static async createConversation() {
    // userId = null to indicate an anonymous conversation
    return prisma.conversation.create({
      data: {
        userId: "ANONYMOUS",
      },
    });
  }

  static async getConversation(conversationId: string) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    // Ensure it's an anonymous conversation
    if (!conv || conv.userId !== null) return null;
    return conv;
  }

  static async getMessages(conversationId: string) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async addUserMessage(conversationId: string, content: string) {
    return prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content,
      },
    });
  }

  static async addAssistantMessage(conversationId: string, content: string) {
    return prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content,
      },
    });
  }

  static async resetConversation(conversationId: string) {
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });
  }

  /**
   * Stream chat completion for GPT-3.5 or GPT-4 only.
   */
  static async streamAnonymousCompletion(
    conversationId: string,
    model: "gpt-3.5-turbo" | "gpt-4o",
    onToken: (token: string) => void
  ) {
    const messages = await this.getMessages(conversationId);

    const perplexityModels = ["sonar-reasoning-pro", "pplx-70b-chat", "mixtral-8x7b-instruct"];
    const isPerplexity = perplexityModels.includes(model);
    const client = isPerplexity ? perplexity : openai;

    const formattedMessages = messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    let completion;
    if (isPerplexity) {
      completion = await perplexity.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: 0.7,
        stream: true,
      });
    } else {
      completion = await openai.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: 0.7,
        stream: true,
      });
    }

    let assistantBuffer = "";

    for await (const part of completion) {
      const token = part.choices?.[0]?.delta?.content ?? "";
      if (token) {
        assistantBuffer += token;
        onToken(token);
      }
    }

    if (assistantBuffer.trim()) {
      await this.addAssistantMessage(conversationId, assistantBuffer);
    }
  }
}