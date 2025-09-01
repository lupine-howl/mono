// src/server.mjs
import { createServer } from "@loki/minihttp";
import { registerDbTools } from "@loki/db";
import path from "node:path";

import plugins from "./config.plugins.js";

const config = {
  schemas: {},
  regFunctions: {},
};

for (const load of plugins) {
  const install = await load();
  install?.(config);
}

createServer({
  baseDir: new URL("./public", import.meta.url).pathname,
  addRoutes: ({ tools, router }) => {
    registerDbTools(tools, {
      dbPath: path.resolve(process.cwd(), "data", "app.db"),
      schemas: config.schemas,
    });
    for (const [key, fn] of Object.entries(config.regFunctions)) {
      fn({ tools, router });
    }
  },
});
