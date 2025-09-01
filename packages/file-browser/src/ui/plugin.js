import { html } from "lit";
import { FileBrowserController } from "../shared/FileBrowserController.js";

// ensure elements are defined
import "./file-browser.js";
import "./file-viewer.js";
import "./file-bundle-viewer.js";
import "./workspace-select.js";

export function createPlugin({ hub } = {}) {
  const ns = "files";
  const controller = new FileBrowserController({ hub });

  const components = {
    body: [
      {
        id: `${ns}:viewer`,
        label: "📄 File",
        order: 30,
        render: ({ controllers }) =>
          html`<file-viewer .controller=${controller}></file-viewer>`,
      },
    ],
    sidebar: [
      {
        id: `${ns}:workspace-select`,
        label: "📁 Workspaces",
        order: 30,
        render: ({ controllers }) =>
          html`<workspace-select .controller=${controller}></workspace-select>`,
      },
      {
        id: `${ns}:browser`,
        label: "📁 Files",
        order: 30,
        render: ({ controllers }) =>
          html`<file-browser .controller=${controller}></file-browser>`,
      },
    ],
  };

  return {
    controllers: { [ns]: controller },
    components,
    async ready() {
      await controller.ready?.();
    },
    dispose() {
      /* nothing to cleanup yet */
    },
  };
}
