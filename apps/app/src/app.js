// examples/src/app.js
import { GithubPluggableApp } from "@loki/layout/ui/GithubPluggableApp.js";
import plugins from "./config.plugins.js";
import * as dbTools from "@loki/db/tools";
import { toolRegistry } from "@loki/minihttp/util";
toolRegistry.defineMany(dbTools);

const config = { components: [], tools: toolRegistry, schemas: {} };

for (const load of plugins) {
  const install = await load();
  install?.(config);
}

export class App extends GithubPluggableApp {
  getPlugins() {
    return config.components;
  }
}
customElements.define("app-root", App);
