// server/openai/index.js
import { mountOpenAIImages } from "./imagesRoute.js";
import { registerImageTools } from "./registerImageTools.js";

/**
 * registerAITools({ router, tools }, opts)
 * - Mounts chat/models/images routes
 * - If `tools` provided, also mounts RPC + OpenAPI *and* adds aiGenerateImage (if missing)
 */
export function registerAIImageTools(
  { router, tools },
  {
    // routes
    imagesPath = "/api/images",
    // OpenAI defaults
    apiKey = process.env.OPENAI_API_KEY,
    imageModel = "dall-e-3",
  } = {}
) {
  // Routes
  mountOpenAIImages(router, { path: imagesPath, apiKey, model: imageModel });
  registerImageTools(tools, { apiKey, model: imageModel });
}
