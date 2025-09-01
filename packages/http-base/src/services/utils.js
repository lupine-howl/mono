export async function readJSON(req, max = 1_000_000) {
  if (req.method === "GET" || req.method === "HEAD") return null;
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw new Error("Payload too large");
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj ?? {}));
}

export function contentTypeFor(ext) {
  switch (ext) {
    case ".html":
      return "text/html";
    case ".js":
      return "text/javascript";
    case ".css":
      return "text/css";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

const ring = [];
const MAX = 100;

export function logEntry(entry) {
  const e = { ts: new Date().toISOString(), ...entry };
  ring.push(e);
  if (ring.length > MAX) ring.shift();
}

export function getLogs() {
  return ring.slice(-MAX);
}

export async function health() {
  return { ok: true, time: Date.now() };
}
