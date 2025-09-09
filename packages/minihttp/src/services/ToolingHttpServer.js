// tooling-http-server.mjs
import { createToolRegistry } from "./toolRegistry.js";
import { MiniHttpServer } from "@loki/http-base";

export class ToolingHttpServer extends MiniHttpServer {
  constructor({
    rpcPrefix = "/rpc",
    openApiPath = "/openapi.json",
    ...baseOpts
  } = {}) {
    super(baseOpts);
    this.tools = createToolRegistry();
    this.rpcPrefix = rpcPrefix;
    this.openApiPath = openApiPath;
  }

  // Explicit async init so we can await addRoutes
  async init({ addRoutes } = {}) {
    if (typeof addRoutes === "function") {
      await addRoutes({ router: this.router, tools: this.tools });
    }

    // Attach only after tools are fully registered
    this.tools.attach(this.router, { prefix: this.rpcPrefix });
    this.tools.mountOpenApi(this.router, this.openApiPath, {
      prefix: this.rpcPrefix,
    });

    return this;
  }
}

export async function createServer(opts = {}) {
  const srv = new ToolingHttpServer(opts);
  await srv.init(opts); // 🔴 await addRoutes work (plugins, tool regs, etc.)
  srv.listen(); // start listening only after routes are mounted
  return {
    server: srv.server,
    router: srv.router,
    stop: () => srv.stop(),
    tools: srv.tools,
  };
}
