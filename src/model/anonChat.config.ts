export const ANONYMOUS_USER_ID = "ANONYMOUS";
export const MAX_MESSAGES_PER_CONVERSATION = 10;
export const MAX_CONTENT_LENGTH = 500;

/**
 * Allowed AI models for anonymous chat.
 */
export const ALLOWED_MODELS = ["gpt-3.5-turbo", "sonar-reasoning-pro"] as const;
export type AllowedModel = typeof ALLOWED_MODELS[number];