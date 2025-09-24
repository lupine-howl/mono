// src/server.mjs
import { createServer } from "@loki/minihttp";
import { db } from "@loki/db";
import plugins from "./config.plugins.js";
import * as dbTools from "@loki/db/tools";
import { toolRegistry } from "@loki/minihttp";
import {
  getGlobalEventBus,
  mountEventsSSE,
  mountEventsIngest,
} from "@loki/events/util";

const bus = getGlobalEventBus();

toolRegistry.defineMany(dbTools);

const config = {
  schemas: {},
  regFunctions: {},
  components: [],
};
createServer({
  baseDir: new URL("./public", import.meta.url).pathname,
  addRoutes: async ({ tools, router }) => {
    mountEventsSSE(router, { path: "/rpc/events", bus }); // server → client
    mountEventsIngest(router, { path: "/rpc/ui-events", bus }); // client → server

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
