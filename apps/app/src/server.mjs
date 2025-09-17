// src/server.mjs
import { createServer } from "@loki/minihttp";
import { db } from "@loki/db";
import plugins from "./config.plugins.js";
import * as dbTools from "@loki/db/tools";
import { toolRegistry } from "@loki/minihttp";
toolRegistry.defineMany(dbTools);

const config = {
  schemas: {},
  regFunctions: {},
};
createServer({
  baseDir: new URL("./public", import.meta.url).pathname,
  addRoutes: async ({ tools, router }) => {
    for (const load of plugins) {
      const install = await load();
      if (install) await install?.({ ...config, tools, router });
    }
    for (const [table, schema] of Object.entries(config.schemas || {})) {
      db.ensureTableFromJsonSchema(table, schema);
    }
    //console.log(config);
    for (const [key, fn] of Object.entries(config.regFunctions)) {
      fn({ tools, router });
    }
  },
});
