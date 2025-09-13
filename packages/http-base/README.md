Great questions. Let's tackle them in parts:

---

## ✅ 1. **Static File Server Helper: Should it go in `minihttp`?**

**Short answer:**
Yes — **as a fallback helper, optionally included**. Here's why:

### 🔍 Benefits of Including It:

- **Encapsulation**: Makes `minihttp` feel more like a "complete tiny server toolkit".
- **Portability**: Helps when bootstrapping new projects or testing without pulling in other layers.
- **Flexibility**: You can export it separately (e.g. `import { serveStatic } from "minihttp"`), or attach it to the router (e.g. `router.handleStatic = serveStatic()`).

### ⚙️ How to Configure the Static Path:

I'd recommend **passing the public directory path as an argument** to `serveStatic(baseDir)`, rather than relying on:

- `PUBLIC_DIR` as a fixed constant (less portable)
- `process.env` (leaky abstraction)
- or a global `config` (too opinionated)

This way, you get flexibility and reusability.

---

## 🧩 Final structure suggestion:

```js
// minihttp.js (new static helper at bottom)
export function serveStaticFrom(baseDir) {
  const root = path.resolve(baseDir);
  return async function serveStatic(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(root, path.normalize(pathname));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return true;
    }

    try {
      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": contentTypeFor(path.extname(filePath)),
      });
      res.end(data);
      return true;
    } catch {
      return false; // let caller 404
    }
  };
}
```

You can then use it like:

```js
const serveStatic = serveStaticFrom("./public");

const server = http.createServer(async (req, res) => {
  const handled = await router.handle(req, res);
  if (handled === false) {
    const served = await serveStatic(req, res);
    if (!served) {
      res.writeHead(404);
      res.end("Not Found");
    }
  }
});
```

> Want me to fold this into the full code block + reprint `minihttp.js` with this included?

---

## 📝 2. `README.md` Suggestion

Here’s a `README.md` to go with your package:

````md
# minihttp

A tiny, functional HTTP router and JSON utility for Node.js.

Perfect for small APIs, local tools, or educational projects. Add routes, parse bodies, stream responses, and even serve static files — all in a single file.

## Features

- Functional `createRouter()` with `get`, `post`, `put`, `del`, and `handle`
- Simple `readJSON(req)` and `sendJSON(res, code, obj)` helpers
- URL parameter parsing (`/api/:userId`)
- Streamed responses
- Minimal static file server helper (`serveStaticFrom(dir)`)

## Install

```bash
npm install minihttp --registry http://localhost:4873
```
````

## Usage

### Basic HTTP Server

```js
import http from "node:http";
import { createRouter } from "minihttp";

const router = createRouter();

router.get("/hello/:name", ({ name }) => ({ message: `Hi ${name}!` }));

const server = http.createServer(router.handle);
server.listen(3000);
```

### Handling POST JSON

```js
router.post("/data", (body) => {
  return { received: body };
});
```

### Streaming Response

```js
import { Readable } from "node:stream";

router.get("/stream", () => {
  const stream = Readable.from(["hello\n", "world\n"]);
  return { stream, headers: { "Content-Type": "text/plain" } };
});
```

### Static Files

```js
import { serveStaticFrom } from "minihttp";

const serveStatic = serveStaticFrom("./public");

const server = http.createServer(async (req, res) => {
  const handled = await router.handle(req, res);
  if (handled === false) {
    const served = await serveStatic(req, res);
    if (!served) {
      res.writeHead(404);
      res.end("Not Found");
    }
  }
});
```

## License

MIT

```

---
```
