// tooling-http-server.mjs
import { createToolRegistry } from "./toolRegistry.js";
import { MiniHttpServer } from "@loki/http-base";
import { PassThrough } from "node:stream";

export class ToolingHttpServer extends MiniHttpServer {
  constructor({
    rpcPrefix = "/rpc",
    openApiPath = "/openapi.json",
    eventsPath = "/rpc-events", // NEW: SSE path
    ...baseOpts
  } = {}) {
    super(baseOpts);
    this.tools = createToolRegistry();
    this.rpcPrefix = rpcPrefix;
    this.openApiPath = openApiPath;
    this.eventsPath = eventsPath;

    this._sseClients = new Set(); // Set<PassThrough>
  }

  _broadcastSse(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this._sseClients) {
      try {
        client.write(payload);
      } catch {
        /* ignore */
      }
    }
  }

  // Explicit async init so we can await addRoutes
  async init({ addRoutes } = {}) {
    // ---- Optional extra routes from caller ----
    if (typeof addRoutes === "function") {
      await addRoutes({ router: this.router, tools: this.tools });
    }

    // ---- Minimal SSE endpoint ----
    this.router.get(this.eventsPath, () => {
      const stream = new PassThrough();
      // Warm up connection (per SSE spec)
      stream.write(":\n\n");
      this._sseClients.add(stream);
      // Remove on close
      stream.on("close", () => this._sseClients.delete(stream));
      return {
        stream,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      };
    });

    // ---- Attach tools AFTER possible registrations ----
    this.tools.attach(this.router, { prefix: this.rpcPrefix });
    this.tools.mountOpenApi(this.router, this.openApiPath, {
      prefix: this.rpcPrefix,
    });

    // Wire registry -> SSE broadcast
    this.tools.setBroadcast((evt) => this._broadcastSse(evt));

    return this;
  }
}

export async function createServer(opts = {}) {
  const srv = new ToolingHttpServer(opts);
  await srv.init(opts); // await addRoutes work (plugins, tool regs, etc.)
  srv.listen(); // start listening only after routes are mounted
  return {
    server: srv.server,
    router: srv.router,
    stop: () => srv.stop(),
    tools: srv.tools,
  };
}
