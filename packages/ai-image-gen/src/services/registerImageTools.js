// server/tools/registerOpenAITools.js
import fs from "node:fs/promises";
import path from "node:path";
import { generateImages } from "./imagesRoute.js";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

/* ---------- helpers ---------- */
const IMAGE_MIME_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const extFromMimeOrUrl = (mime = "", url = "") => {
  const byMime = IMAGE_MIME_TO_EXT[mime.toLowerCase()];
  if (byMime) return byMime;

  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop() || "";
    const ext = last.includes(".") ? last.split(".").pop() : "";
    if (ext) return ext.toLowerCase();
  } catch {}
  return "png";
};

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

// Build a public URL under imagesRoute for a file inside imagesAbs
function publicPathFromFile(absFile, imagesAbs, imagesRoute = "/images") {
  const rel = path.relative(imagesAbs, absFile); // OS-specific
  const parts = rel.split(path.sep).map(encodeURIComponent);
  const base = imagesRoute.endsWith("/")
    ? imagesRoute.slice(0, -1)
    : imagesRoute;
  return `${base}/${parts.join("/")}`; // POSIX URL
}

// put near your helpers

// OPTIONAL: prefer IPv4 to avoid some ISP/v6 hiccups
// setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, { timeoutMs = 15_000, ...opts } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("fetch-timeout")), timeoutMs);
  try {
    return await fetch(url, { signal: ac.signal, redirect: "follow", ...opts });
  } finally {
    clearTimeout(t);
  }
}

async function downloadUrlToFile(
  url,
  absDir,
  baseNameHint = "",
  {
    timeoutMs = 15_000,
    retries = 3,
    backoffBaseMs = 400,
    dispatcher = undefined, // pass an undici Agent if you want (e.g., IPv4)
  } = {}
) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { timeoutMs, dispatcher });
      if (!res.ok) {
        // Retry on “retryable” HTTP codes
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw new Error(`Download failed ${res.status}: ${url}`);
        }
      } else if (!res.body) {
        throw new Error("Empty response body");
      }

      // Content-type → extension
      const ct = res.headers.get("content-type") || "";
      const ext = extFromMimeOrUrl(ct, url);
      const fname =
        baseNameHint && !baseNameHint.includes(".")
          ? `${baseNameHint}.${ext}`
          : baseNameHint || `image-${Date.now()}.${ext}`;

      const absFile = path.join(absDir, fname);
      await fs.mkdir(absDir, { recursive: true });

      // Stream to disk (more resilient than buffering whole file)
      const nodeStream = Readable.fromWeb(res.body);
      await pipeline(nodeStream, createWriteStream(absFile));

      // Simple sanity check: non-empty file?
      const stat = await fs.stat(absFile).catch(() => null);
      if (!stat || stat.size === 0) throw new Error("Zero-byte download");

      const mime = ct || `image/${ext === "jpg" ? "jpeg" : ext}`;
      return { absFile, mime };
    } catch (err) {
      lastErr = err;
      const code = /** @type {any} */ (err)?.code || "";
      const isRetryable =
        RETRYABLE_CODES.has(code) ||
        /fetch-timeout|network|socket|reset|timeout/i.test(String(err)) ||
        (err.message &&
          /Zero-byte|Download failed (408|429|5\d{2})/.test(err.message));

      if (attempt >= retries || !isRetryable) break;

      const delay =
        backoffBaseMs * Math.pow(2, attempt - 1) + Math.random() * 150;
      await sleep(delay);
      continue;
    }
  }
  throw lastErr;
}

async function writeBase64ToFile(b64, mime, absDir, baseNameHint = "") {
  const ext = extFromMimeOrUrl(mime);
  const fname =
    baseNameHint && !baseNameHint.includes(".")
      ? `${baseNameHint}.${ext}`
      : baseNameHint || `image-${Date.now()}.${ext}`;
  const absFile = path.join(absDir, fname);
  await fs.writeFile(absFile, Buffer.from(b64, "base64"));
  return { absFile, mime: mime || `image/${ext === "jpg" ? "jpeg" : ext}` };
}

/* ---------- defaults ---------- */
// Save to <rootDir>/images by default
const DEFAULT_IMAGES_DIR = "images";

/* ---------- registry ---------- */
export function registerImageTools(
  tools,
  {
    apiKey,
    model = "dall-e-3",
    // You can override rootDir/imagesDir/imagesRoute if your layout differs:
    rootDir = process.cwd(),
    imagesDir = DEFAULT_IMAGES_DIR, // <rootDir>/images
    imagesRoute = "/images", // served by your HTTP server at /images/*
  } = {}
) {
  const imagesAbs = path.isAbsolute(imagesDir)
    ? imagesDir
    : path.join(rootDir, imagesDir);

  /* 1) Plain generator (unchanged) */
  tools.define({
    name: "aiGenerateImage",
    description:
      "Generate 1+ images from a text prompt. Returns { images: [{ url? | b64?, data_url?, mime? }] }",
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Text prompt for the image" },
        model: { type: "string", description: "Image model", default: model },
        n: { type: "integer", description: "How many images", default: 1 },
        size: {
          type: "string",
          description: "Image size (e.g. 512x512, 1024x1024)",
          default: "1024x1024",
        },
        transparent_background: {
          type: "boolean",
          description: "Request transparent background when supported",
          default: false,
        },
        style: { type: "string", description: "e.g. 'vivid' | 'natural'" },
        quality: { type: "string", description: "e.g. 'standard' | 'hd'" },
      },
      additionalProperties: false,
    },
    handler: async (args) => generateImages({ apiKey, model }, args),
    tags: ["AI", "Images"],
  });

  /* 2) Generate + save to <rootDir>/images, return public URLs at imagesRoute */
  tools.define({
    name: "aiImageGenerateAndDownload",
    description:
      "Generate images and save to <rootDir>/images (configurable). Returns { images, saved:[{ path, publicPath, mime, from? }] }",
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Text prompt for the image" },
        model: { type: "string", description: "Image model", default: model },
        n: { type: "integer", description: "How many images", default: 1 },
        size: {
          type: "string",
          description: "Image size (e.g. 512x512, 1024x1024)",
          default: "1024x1024",
        },
        transparent_background: {
          type: "boolean",
          description: "Request transparent background when supported",
          default: false,
        },
        style: { type: "string", description: "e.g. 'vivid' | 'natural'" },
        quality: { type: "string", description: "e.g. 'standard' | 'hd'" },
        // Optional name prefix; files will look like "<prefix>-1.png"
        filenamePrefix: { type: "string", description: "Optional file prefix" },
      },
      additionalProperties: false,
    },
    tags: ["AI", "Images"],
    handler: async (args) => {
      const { filenamePrefix = "", ...genArgs } = args;

      // 1) Generate
      const out = await generateImages({ apiKey, model }, genArgs);
      const images = Array.isArray(out?.images) ? out.images : [];

      // 2) Ensure target dir
      await ensureDir(imagesAbs);

      // 3) Save each image
      let idx = 0;
      const saved = [];
      for (const img of images) {
        idx += 1;
        const baseHint = filenamePrefix
          ? `${filenamePrefix}-${idx}`
          : `image-${Date.now()}-${idx}`;

        try {
          if (img?.url) {
            // URL case
            const { absFile, mime } = await downloadUrlToFile(
              img.url,
              imagesAbs,
              baseHint
            );
            saved.push({
              path: path.relative(rootDir, absFile),
              publicPath: publicPathFromFile(absFile, imagesAbs, imagesRoute),
              mime: mime || "image/png",
              from: img.url,
            });
            continue;
          }

          const b64 = img?.b64 || (img?.data_url?.split(",")[1] ?? null);
          const mime =
            img?.mime ||
            (img?.data_url?.match(/^data:(.+?);base64,/)?.[1] ?? "image/png");

          if (b64) {
            const { absFile, mime: m } = await writeBase64ToFile(
              b64,
              mime,
              imagesAbs,
              baseHint
            );
            saved.push({
              path: path.relative(rootDir, absFile),
              publicPath: publicPathFromFile(absFile, imagesAbs, imagesRoute),
              mime: m,
            });
            continue;
          }

          saved.push({
            error:
              "No usable image payload (need url or base64). Check model/adapter.",
          });
        } catch (e) {
          saved.push({ error: String(e?.message || e) });
        }
      }

      return { ...out, saved, messageType: "image" };
    },
  });
}
