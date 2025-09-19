// server/openai/index.js
import { mountChatRoute } from "./chatHandler.js";

/**
 * registerAITools({ router, tools }, opts)
 * - Mounts chat/models routes
 */
export function registerAITools(
  { router, tools },
  {
    // routes
    aiPath = "/api/ai",
    modelsPath = "/api/models",
    // OpenAI defaults
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4o-mini",
    filterModels = null,
    baseUrl = "https://api.openai.com/v1",
  } = {}
) {
  // Routes
  mountChatRoute(router, tools, { path: aiPath, apiKey, model, baseUrl });
}
