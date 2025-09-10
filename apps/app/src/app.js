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
rpc.onCall("fsList", async (args) => {
  console.log("fsList called with args:", args);
  return ["file1.txt", "file2.txt", "file3.txt"];
});
customElements.define("app-root", App);
