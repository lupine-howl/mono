// src/ui/plugin.js
import { html } from "lit";
import "@loki/file-browser/ui/file-viewer.js";
import "@loki/file-browser/ui/workspace-select.js";
import "@loki/file-browser/ui/file-browser.js";
import "@loki/file-browser/ui/workspace-directory.js";

export default ({ components }) => {
  const ns = "file";
  components.push({
    body: [      {
        id: `${ns}:workspace-directory`,
        label: "📚 Workspaces",
        order: 25,
        render: () => html`<workspace-directory></workspace-directory>`,
      },
],
    sidebar: [
      {
        id: `${ns}:workspace-select`,
        label: "📁 Workspaces",
        order: 30,
        ws:"packages/file-browser",
        path:"src/ui/workspace-select.js",
        render: () => html`<workspace-select></workspace-select>`,
      },
      {
        id: `${ns}:browser`,
        label: "📁 Files",
        order: 30,
        ws:"packages/file-browser",
        path:"src/ui/file-browser.js",
        render: () => html`<file-browser></file-browser>`,
      },
    ],
  });
};
