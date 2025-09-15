// examples/src/app.js
import { GithubPluggableApp } from "@loki/layout/ui/GithubPluggableApp.js";
import plugins from "./config.plugins.js";
import { rpc } from "@loki/minihttp/util";

const config = { components: [] };

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
