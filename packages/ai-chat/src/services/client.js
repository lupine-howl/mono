// Tiny OpenAI client helpers
import { createLogger } from "@loki/http-base/util";

const logger = createLogger({ name: "[@loki/chat-ai]" });

export function makeOpenAIClient({
  apiKey,
  baseUrl = "https://api.openai.com/v1",
} = {}) {
  if (!apiKey) console.warn("[openai] Missing OPENAI_API_KEY");
  const headers = {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };

  async function chatCompletions(payload) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    logger.info("chat completion response", {
      ok: res.ok,
      status: res.status,
      data,
    });
    return { ok: res.ok, status: res.status, data };
  }

  async function listModels() {
    const res = await fetch(`${baseUrl}/models`, { headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  async function imagesGenerate(payload) {
    // OpenAI Images API (uses /images/generations)
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  return { chatCompletions, listModels, imagesGenerate };
}
