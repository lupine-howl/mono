// examples/src/app.js
import { BasePluggableApp } from "@loki/layout/ui/BasePluggableApp.js";
import FilePlugin from "@loki/file-browser/plugin";

const config = {
  components: [],
};

FilePlugin(config);

export class App extends BasePluggableApp {
  getPlugins() {
    return config.components;
  }
}
customElements.define("app-root", App);
