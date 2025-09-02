import { Router } from "./Router.js";
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { contentTypeFor } from "./utils.js";
import { health, logEntry, getLogs } from "./utils.js";

function htmlEscape(s = "") {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

// Which extensions count as "images" for thumbnails
const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".avif",
]);

function isBaseOrUnder(pathname, base) {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return pathname === b || pathname.startsWith(b + "/");
}

export async function tryServeFile(
  rootDir,
  req,
  res,
  { urlBase = "/", dirIndex = false, grid = true, hideDotfiles = true } = {}
) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!isBaseOrUnder(url.pathname, urlBase)) return false;

  const root = path.resolve(rootDir);

  // Compute encoded path under mount, then decode per-segment for FS
  const base = urlBase.endsWith("/") ? urlBase.slice(0, -1) : urlBase;
  let relEncoded = url.pathname.slice(base.length);
  if (relEncoded.startsWith("/")) relEncoded = relEncoded.slice(1);

  const segments = relEncoded
    ? relEncoded
        .split("/")
        .filter(Boolean)
        .map((s) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        })
    : [];

  const fsPath = segments.length ? path.join(root, ...segments) : root;

  // Traversal guard
  const resolved = path.resolve(fsPath);
  if (!resolved.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  const st = await fs.stat(resolved).catch(() => null);

  // Directory: try index.html, else render listing (grid if configured)
  if (st?.isDirectory()) {
    const indexPath = path.join(resolved, "index.html");
    const hasIndex = await fs
      .stat(indexPath)
      .then((s) => s.isFile())
      .catch(() => false);
    if (hasIndex) {
      const data = await fs.readFile(indexPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
      return true;
    }
    if (!dirIndex) return false;

    const entries = await fs
      .readdir(resolved, { withFileTypes: true })
      .catch(() => []);
    // Build links relative to the *encoded* URL path (preserves existing encoding)
    const currentEncoded = url.pathname.endsWith("/")
      ? url.pathname
      : url.pathname + "/";

    const items = entries
      .filter((d) => (hideDotfiles ? !d.name.startsWith(".") : true))
      .map((d) => {
        const name = d.name;
        const href =
          currentEncoded +
          encodeURIComponent(name) +
          (d.isDirectory() ? "/" : "");
        const isDir = d.isDirectory();
        const ext = path.extname(name).toLowerCase();
        const isImg = !isDir && IMAGE_EXTS.has(ext);
        return { name, href, isDir, isImg, ext };
      })
      // Directories first, then files; alpha by name
      .sort((a, b) =>
        a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1
      );

    const upHref = currentEncoded.replace(/[^/]+\/$/, "") || base || "/";

    const title = (base || "/") + (relEncoded ? "/" + relEncoded : "/");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Index of ${htmlEscape(title)}</title>
  <style>
    :root { color-scheme: dark; }
    body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f0f12;color:#e7e7ea;margin:0;padding:16px}
    a{color:#7ab7ff;text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:1100px;margin:0 auto}
    h1{font-size:16px;margin:0 0 12px}
    .crumbs{margin:6px 0 14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
    .card{background:#121216;border:1px solid #222;border-radius:10px;padding:10px;text-align:center}
    .thumb{display:block;aspect-ratio:1/1;overflow:hidden;border-radius:8px;border:1px solid #1f1f22;background:#0a0a0c}
    .thumb img{width:100%;height:100%;object-fit:contain;display:block}
    .name{margin-top:8px;font-size:12px;word-break:break-word}
    .file{padding:8px 10px}
    .file a{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dir .thumb{display:flex;align-items:center;justify-content:center;font-size:42px;opacity:.9}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Index of ${htmlEscape(title)}</h1>
    <div class="crumbs">${
      url.pathname !== base ? `<a href="${upHref}">⬆️ Parent directory</a>` : ""
    }</div>

    <div class="grid">
      ${items
        .map((i) => {
          if (i.isDir) {
            return `
            <div class="card dir">
              <a class="thumb" href="${i.href}" title="${htmlEscape(
              i.name
            )}">📁</a>
              <div class="name"><a href="${i.href}">${htmlEscape(
              i.name
            )}/</a></div>
            </div>`;
          }
          if (i.isImg) {
            return `
            <div class="card img">
              <a class="thumb" href="${i.href}" title="${htmlEscape(i.name)}">
                <img src="${i.href}" alt="${htmlEscape(
              i.name
            )}" loading="lazy" />
              </a>
              <div class="name"><a href="${i.href}" title="${htmlEscape(
              i.name
            )}">${htmlEscape(i.name)}</a></div>
            </div>`;
          }
          // non-image file fallback: simple row styled as a "card"
          return `
          <div class="card file">
            <a href="${i.href}" title="${htmlEscape(i.name)}">📄 ${htmlEscape(
            i.name
          )}</a>
          </div>`;
        })
        .join("")}
    </div>
  </div>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  }

  // File: serve bytes
  if (st?.isFile()) {
    const data = await fs.readFile(resolved);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(path.extname(resolved)),
    });
    res.end(data);
    return true;
  }

  return false;
}

export class MiniHttpServer {
  constructor({
    port = 3000,
    host = "0.0.0.0",
    baseDir = "./public",
    imagesDir = "./images", // e.g. "./assets"
    imagesRoute = "/images", // served as /images/*
    addSimpleRoutes = ({ router }) => {}, // user-supplied
    onRequest = null, // (req, res) => void
  } = {}) {
    this.port = port;
    this.host = host;
    this.baseDir = baseDir;
    this.imagesDir = imagesDir;
    this.imagesRoute = imagesRoute;
    this.onRequest = onRequest;

    this.router = new Router();
    addSimpleRoutes({ router: this.router });

    this.server = http.createServer(this.#handler.bind(this));
    // Built-in utility routes
    this.router.get("/api/health", health);
    this.router.get("/api/logs", getLogs);
    this.router.post("/api/logs", logEntry);
    this.router.get("/api/endpoints", () => this.router.listRoutes());
  }

  async #handler(req, res) {
    try {
      this.onRequest?.(req, res);
    } catch {}

    // 1) Dynamic routes
    const routed = await this.router.handle(req, res);
    if (routed !== false) return;

    // 2) Optional images mount
    if (this.imagesDir && this.imagesRoute) {
      if (
        await tryServeFile(this.imagesDir, req, res, {
          urlBase: this.imagesRoute, // e.g. "/images"
          dirIndex: true, // 👈 turns on auto index
          hideDotfiles: true,
        })
      )
        return;
    }
    // 3) Main static
    if (await tryServeFile(this.baseDir, req, res, { urlBase: "/" })) return;

    // 4) 404
    res.writeHead(404);
    res.end("Not Found");
  }

  listen(cb) {
    this.server.listen(this.port, this.host, () => {
      console.log(`[OK] Server running at http://${this.host}:${this.port}`);
      cb?.();
    });
    return this;
  }
  async stop() {
    await new Promise((r) => this.server.close(r));
  }
}

export function createSimpleServer(opts = {}) {
  const srv = new MiniHttpServer(opts).listen();
  return { server: srv.server, router: srv.router, stop: () => srv.stop() };
}
