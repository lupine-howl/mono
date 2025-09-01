// examples/src/app.js
import { BasePluggableApp } from "@loki/layout/ui/BasePluggableApp.js";
import { createPlugin as createPersonasPlugin } from "@loki/personas/ui/plugin.js";
// import { createFilesPlugin } from "@loki/files/ui/bundle.js";

export class App extends BasePluggableApp {
  constructor() {
    super();
    this.storageKey = "activeTab";
  }
  getPlugins() {
    // share the same hub (this element) for controller↔controller events
    const hub = this;
    return [
      createPersonasPlugin({ hub }),
      // createFilesPlugin({ hub }),
    ];
  }
}
customElements.define("app-root", App);
