// server/services/model/aiProviders.ts

import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';
import { MessageStreamEvent, TextDelta } from "@anthropic-ai/sdk/resources";
import { Message as AnthropicMessage } from "@anthropic-ai/sdk/resources";
import { MessageParam } from "@anthropic-ai/sdk/resources";

import type { ChatMessage } from "../services/chat.service";  // We reuse the ChatMessage type

export function getAIProviderForModel(model: string): AIProvider {
  // Initialize with your environment variables
  const openaiAPIKey = process.env.OPENAI_API_KEY;
  const perplexityAPIKey = process.env.PERPLEXITY_API_KEY;
  const anthropicAPIKey = process.env.ANTHROPIC_API_KEY;
  const geminiAPIKey = process.env.GEMINI_API_KEY
  const deepseekAPIKey = process.env.DEEPSEEK_API_KEY;

  const providers: AIProvider[] = [
    new OpenAIProvider(openaiAPIKey),
    new PerplexityProvider(perplexityAPIKey),
    new AnthropicProvider(anthropicAPIKey),
    new GeminiProvider(geminiAPIKey),
    new DeepSeekProvider(deepseekAPIKey),
  ];

  const provider = providers.find((p) => p.canHandle(model));
  if (!provider) {
    throw new Error(`[AIProviders] No provider found for model: ${model}`);
  }

  return provider;
}

/**
 * AIProvider interface: every provider must implement this.
 */
export interface AIProvider {
  /**
   * Returns true if this provider can handle the given `model`.
   */
  canHandle(model: string): boolean;

  /**
   * Streams the AI completion.
   * 
   * @param messages    an array of ChatMessage
   * @param model       string representing which model to use (e.g. "gpt-4o", "claude-3-sonnet")
   * @param onToken     callback for each streamed token
   * @returns           total tokens (approx)
   */
  streamCompletion(
    messages: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ): Promise<number>;
}

/**
 * Example: store the actual model endpoint names if needed.
 * For OpenAI, we might have "gpt-4o" or "gpt-3.5-turbo".
 */
const OPENAI_MODELS = new Set(["gpt-4o", "gpt-3.5-turbo", "gpt-4o-mini"]);

/**
 * The OpenAI provider implementation
 */
export class OpenAIProvider implements AIProvider {
  private openai: OpenAI;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      console.warn("[OpenAIProvider] No OPENAI_API_KEY set in environment.");
    }
    this.openai = new OpenAI({ apiKey });
  }

  canHandle(model: string): boolean {
    return OPENAI_MODELS.has(model);
  }

  async streamCompletion(
    messages: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ): Promise<number> {
    let totalTokens = 0;

    // Use the official OpenAI shape for messages
    const formatted = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const completion = await this.openai.chat.completions.create({
      model,
      messages: formatted,
      temperature: 0.7,
      stream: true,
    });

    for await (const part of completion) {
      const token = part.choices?.[0]?.delta?.content ?? "";
      if (token) {
        onToken(token);
        totalTokens++;
      }
    }

    return totalTokens;
  }
}

/**
 * The Perplexity provider implementation
 */
export class PerplexityProvider implements AIProvider {
  private perplexity: OpenAI;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      console.warn("[PerplexityProvider] No PERPLEXITY_API_KEY set in environment.");
    }
    this.perplexity = new OpenAI({
      apiKey,
      baseURL: "https://api.perplexity.ai",
    });
  }

  private static PERPLEXITY_MODELS = new Set([
    "sonar-reasoning-pro",
    "pplx-70b-chat",
    "mixtral-8x7b-instruct",
  ]);

  canHandle(model: string): boolean {
    return PerplexityProvider.PERPLEXITY_MODELS.has(model);
  }

  async streamCompletion(
    messages: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ): Promise<number> {
    let totalTokens = 0;

    const formatted = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const completion = await this.perplexity.chat.completions.create({
      model,
      messages: formatted,
      temperature: 0.7,
      stream: true,
    });

    for await (const part of completion) {
      const token = part.choices?.[0]?.delta?.content ?? "";
      if (token) {
        onToken(token);
        totalTokens++;
      }
    }

    return totalTokens;
  }
}

/**
 * The Anthropic/Claude provider implementation
 */
export class AnthropicProvider implements AIProvider {
  private static readonly CLAUDE_MODELS: Record<string, string> = {
    "claude-3-sonnet": "claude-3-sonnet-20240229",
    "claude-3-haiku": "claude-3-haiku-20240307",
  };

  private anthropic: Anthropic;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      console.warn("[AnthropicProvider] No ANTHROPIC_API_KEY set in environment.");
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  canHandle(model: string): boolean {
    // Return true if model is in our CLAUDE_MODELS table
    return AnthropicProvider.CLAUDE_MODELS.hasOwnProperty(model);
  }

  async streamCompletion(
    messages: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ): Promise<number> {
    let totalTokens = 0;

    // Map "system" -> "assistant", since Anthropic only wants "user"/"assistant".
    const anthropicMessages: MessageParam[] = messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    // Lookup the real model endpoint
    const claudeModel = AnthropicProvider.CLAUDE_MODELS[model];
    if (!claudeModel) {
      throw new Error(`[AnthropicProvider] Unknown Claude model: ${model}`);
    }

    const stream = await this.anthropic.messages.create({
      messages: anthropicMessages,
      model: claudeModel,
      max_tokens: 4096,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta") {
        const delta = chunk.delta as TextDelta;
        if (delta.text) {
          onToken(delta.text);
          totalTokens++;
        }
      }
    }

    return totalTokens;
  }
}

/**
 * Factory function: returns the correct AIProvider instance
 * given the `model`. We create one instance per request or
 * you could reuse singletons, depending on your needs.
 */


export class DeepSeekProvider implements AIProvider {
  private deepseekApiKey: string;
  private deepseekBaseUrl: string;

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      console.warn("[DeepSeekProvider] No DEEPSEEK_API_KEY set in environment.");
    }
    this.deepseekApiKey = apiKey || "";
    this.deepseekBaseUrl = "https://api.deepseek.com/v1"; // Replace with the actual DeepSeek API URL
  }

  canHandle(model: string): boolean {
    // Define the models that DeepSeek can handle
    const DEEPSEEK_MODELS = new Set(["deepseek-v3", "deepseek-v3.5"]); // Replace with actual DeepSeek model names
    return DEEPSEEK_MODELS.has(model);
  }

  async streamCompletion(
    messages: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ): Promise<number> {
    let totalTokens = 0;

    // Format messages for DeepSeek API
    const formattedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API request failed with status ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to read stream from DeepSeek API");
    }

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      buffer += chunk;

      // Process each token in the buffer
      const tokens = buffer.split("\n");
      buffer = tokens.pop() || ""; // Keep the last incomplete token in the buffer

      for (const token of tokens) {
        if (token.trim()) {
          const parsedToken = JSON.parse(token);
          const content = parsedToken.choices[0]?.delta?.content || "";
          if (content) {
            onToken(content);
            totalTokens++;
          }
        }
      }
    }

    return totalTokens;
  }
}

export class GeminiProvider implements AIProvider {
  private openai: OpenAI; // Gemini uses the OpenAI client

  constructor(apiKey: string | undefined) {
    if (!apiKey) {
      console.warn("[GeminiProvider] No GEMINI_API_KEY set in environment.");
    }
    this.openai = new OpenAI({ apiKey, baseURL: "https://api.generativeai.google.com/v1beta2" });
  }

  private static GEMINI_MODELS = new Set([
      "gemini-pro"
  ]);

  canHandle(model: string): boolean {
    return GeminiProvider.GEMINI_MODELS.has(model);
  }

  async streamCompletion(
    messages: ChatMessage[],
    model: string,
    onToken: (token: string) => void
  ): Promise<number> {
    let totalTokens = 0;

    const formatted = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const completion = await this.openai.chat.completions.create({
      model,
      messages: formatted,
      temperature: 0.7,
      stream: true,
    });

    for await (const part of completion) {
      const token = part.choices?.[0]?.delta?.content ?? "";
      if (token) {
        onToken(token);
        totalTokens++;
      }
    }

    return totalTokens;
  }
}