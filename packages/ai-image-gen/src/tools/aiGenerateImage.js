// images adapter (no HTTP endpoint)
import { createLogger } from "@loki/http-base/util";

const logger = createLogger({ name: "generateImages" });
let apiKey = null;
if (typeof process !== "undefined" && process?.env) {
  apiKey = process.env.OPENAI_API_KEY;
}
const defaultModel = "dall-e-3";

export const aiGenerateImage = {
  name: "aiGenerateImage",
  description:
    "Generate 1+ images from a text prompt. Returns { images: [{ url? | b64?, data_url?, mime? }] }",
  parameters: {
    type: "object",
    required: ["prompt", "filename"],
    properties: {
      prompt: { type: "string", description: "Text prompt for the image" },
      model: {
        type: "string",
        description: "Image model",
        default: defaultModel,
      },
      filename: {
        type: "string",
        description:
          "A short filename based on the prompt. No spaces or special characters. No extension.",
      },
      n: { type: "integer", description: "How many images", default: 1 },
      size: {
        type: "string",
        description: "Image size (e.g. 512x512, 1024x1024)",
        default: "1024x1024",
        enum: ["1024x1024", "1024x1792", "1792x1024"],
      },
      transparent_background: {
        type: "boolean",
        description: "Request transparent background when supported",
        default: false,
      },
      style: {
        type: "string",
        description: "e.g. 'vivid' | 'natural'",
        enum: ["vivid", "natural"],
        default: "natural",
      },
      quality: {
        type: "string",
        description: "e.g. 'standard' | 'hd'",
        enum: ["standard", "hd"],
        default: "standard",
      },
    },
    additionalProperties: false,
  },
  handler: async ({
    prompt,
    model = defaultModel,
    n = 1,
    size = "1024x1024",
    transparent_background = false,
    style = null, // e.g. "vivid" | "natural"
    quality = null, // e.g. "standard" | "hd"
    filename,
  } = {}) => {
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Missing or invalid 'prompt'");
    }

    const body = {
      model,
      prompt,
      n, // respect caller's requested count
      size,
      ...(quality ? { quality } : {}),
      ...(style ? { style } : {}),
      ...(transparent_background ? { background: "transparent" } : {}),
    };

    // Log request payload for observability
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

    logger.log(response);

    const mime = "image/png";
    const items = (Array.isArray(response?.data) ? response.data : []).map(
      (it) => {
        const revised_prompt = it.revised_prompt || "";
        const url = it.url || "";
        return {
          mime,
          prompt: revised_prompt,
          url,
        };
      }
    );
    const image = items[0] || {};

    return {
      model: body.model,
      prompt,
      size,
      mime,
      image,
      followup: {
        tool: "fsDownloadFromUrl",
        args: { url: image.url, ws: "images", path: `${filename}.png` },
      },
    };
  },
};
