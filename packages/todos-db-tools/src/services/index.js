import { mountPingRoutes } from "./routes.js";

export function registerPings({ router }, opts = {}) {
  mountPingRoutes(router, opts);
}

export * from "./tools.js";
