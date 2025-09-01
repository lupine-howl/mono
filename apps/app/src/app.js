// examples/src/app.js
import { BasePluggableApp } from "@loki/layout/ui/BasePluggableApp.js";
import plugins from "./config.plugins.js";

const config = { components: [] };

for (const load of plugins) {
  const install = await load();
  install?.(config);
}

export class App extends BasePluggableApp {
  getPlugins() {
    return config.components;
  }
}
customElements.define("app-root", App);
