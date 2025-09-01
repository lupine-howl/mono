import { createServer } from "@loki/minihttp";
createServer({
  port: 3000,
  baseDir: new URL("./public", import.meta.url).pathname,
});
