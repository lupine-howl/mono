import { createToolRegistry } from "./toolRegistry";
import { MiniHttpServer } from "@loki/http-base";

export class ToolingHttpServer extends MiniHttpServer {
  constructor({
    rpcPrefix = "/rpc",
    openApiPath = "/openapi.json",
    addRoutes = null, // (router, tools) => void
    ...baseOpts
  } = {}) {
    super(baseOpts);

    this.tools = createToolRegistry();

    // Optional extra tool-defined routes
    if (typeof addRoutes === "function") {
      addRoutes({ router: this.router, tools: this.tools });
    }

    // Attach tools
    this.tools.attach(this.router, { prefix: rpcPrefix });
    this.tools.mountOpenApi(this.router, openApiPath, { prefix: rpcPrefix });
  }
}

export function createServer(opts = {}) {
  const srv = new ToolingHttpServer(opts).listen();
  return {
    server: srv.server,
    router: srv.router,
    stop: () => srv.stop(),
    tools: srv.tools,
  };
}
