// src/server.mjs
import { createServer } from "@loki/minihttp";
import { registerDbTools } from "@loki/db";
import path from "node:path";

import FilePlugin from "@loki/file-browser/plugin";

const config = {
  schemas: {},
  regFunctions: [],
};

FilePlugin(config);

createServer({
  port: 3000,
  baseDir: new URL("./public", import.meta.url).pathname,
  addRoutes: ({ tools, router }) => {
    registerDbTools(tools, {
      dbPath: path.resolve(process.cwd(), "data", "app.db"),
      schemas: config.schemas,
    });
    config.regFunctions.forEach((fn) => {
      fn({ tools, router });
    });
  },
});
