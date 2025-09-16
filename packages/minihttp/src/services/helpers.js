// index.js (ESM) – auto-load all ./tools/*.js and register them
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A value is considered a "tool object" if:
 *  - it's an object,
 *  - it has a string `name`,
 *  - it has a function `handler`.
 */
function isToolObject(v) {
  return (
    v &&
    typeof v === "object" &&
    typeof v.name === "string" &&
    typeof v.handler === "function"
  );
}

// Helper: load functions from a directory.
// Picks `default` if it's a function; otherwise:
//  - if exactly one function export, use it
//  - else registers all function exports by their export names
export async function loadToolsFromDir(dirUrl) {
  const dirPath = fileURLToPath(dirUrl);
  const out = {};

  for (const file of readdirSync(dirPath)) {
    if (!/\.m?js$/.test(file)) continue;
    if (file === "index.js" || file === "index.mjs") continue;

    const modUrl = new URL(file, dirUrl);
    const mod = await import(modUrl);

    const base = file.replace(/\.m?js$/, "");

    if (typeof mod.default === "function") {
      // Prefer default export; key off filename (gitStatus.js -> gitStatus)
      out[base] = mod.default;
      continue;
    }

    const funcs = Object.entries(mod).filter(([, v]) => isToolObject(v));

    if (funcs.length === 1) {
      // Single named function export -> key off filename
      out[base] = funcs[0][1];
    } else {
      // Multiple functions exported -> register by their export names
      for (const [name, fn] of funcs) out[name] = fn;
    }
  }

  return out;
}
