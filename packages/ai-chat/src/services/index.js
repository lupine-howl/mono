// server/openai/index.js
import { mountChatRoute } from "./chatHandler.js";
import { mountModelsRoute } from "./modelsHandler.js";

/**
 * registerAITools({ router, tools }, opts)
 * - Mounts chat/models/images routes
 * - If `tools` provided, also mounts RPC + OpenAPI *and* adds aiGenerateImage (if missing)
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
  } = {}
) {
  // Routes
  mountChatRoute(router, tools, { path: aiPath, apiKey, model });
  mountModelsRoute(router, { path: modelsPath, apiKey, filter: filterModels });
}
