// server/openai/handlers/images.js
import { createLogger } from "@loki/http-base/util";

const logger = createLogger({ name: "generateImages" });

export async function generateImages(
  {
    apiKey = process.env.OPENAI_API_KEY,
    model: defaultModel = "dall-e-3",
  } = {},
  {
    prompt,
    model,
    n = 1,
    size = "1024x1024",
    transparent_background = false,
    style = null, // e.g. "vivid" | "natural"
    quality = null, // e.g. "standard" | "hd"
  } = {}
) {
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Missing or invalid 'prompt'");
  }

  const body = {
    model: model || defaultModel,
    prompt,
    n: 1,
    size,
    ...(quality ? { quality } : {}),
    ...(style ? { style } : {}),
    ...(transparent_background ? { background: "transparent" } : {}),
  };

  logger.log(body);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const response = await res.json();
  if (!res.ok) {
    const msg = response?.error?.message || "OpenAI images error";
    throw new Error(`${res.status} ${msg}`);
  }

  // image-1
  const mime = "image/png";
  const items = (Array.isArray(response?.data) ? response.data : []).map(
    (it) => {
      const b64 = it.b64_json || "";
      const revised_prompt = it.revised_prompt || "";
      const url = it.url || "";
      return {
        b64,
        mime,
        data_url: b64 ? `data:${mime};base64,${b64}` : null,
        prompt: revised_prompt,
        url,
      };
    }
  );

  logger.log(items);

  return {
    model: body.model,
    prompt,
    size,
    mime,
    n: items.length,
    images: items,
  };
}

export function mountOpenAIImages(
  router,
  { path = "/api/images", ...opts } = {}
) {
  if (!opts.apiKey) {
    console.warn("[openai-images] OPENAI_API_KEY is not set.");
  }

  router.post(path, async (args) => {
    try {
      const out = await generateImages(opts, args || {});
      return { status: 200, json: out };
    } catch (err) {
      return { status: 500, json: { error: String(err?.message || err) } };
    }
  });
}
