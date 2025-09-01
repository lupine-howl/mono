import { createServer } from "@loki/minihttp";
import { registerDbTools } from "@loki/db";
import { personasSchema as personas } from "@loki/personas/util";

createServer({
  port: 3000,
  baseDir: new URL("./public", import.meta.url).pathname,
  addRoutes: ({ tools }) => {
    registerDbTools(tools, {
      schemas: { personas },
    });
  },
});
