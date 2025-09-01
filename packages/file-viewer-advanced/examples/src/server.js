import { createServer } from "@loki/minihttp";
import {
  registerFsTools,
  defaultWorkspaces as workspaces,
} from "@loki/file-browser";

createServer({
  port: 3000,
  baseDir: new URL("./public", import.meta.url).pathname,
  addRoutes: ({ tools }) => {
    registerFsTools(tools, { workspaces });
  },
});
