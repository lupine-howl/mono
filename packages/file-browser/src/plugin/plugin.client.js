// src/ui/plugin.js
import { html } from "lit";
import "@loki/file-browser/ui/file-viewer.js";
import "@loki/file-browser/ui/workspace-select.js";
import "@loki/file-browser/ui/file-browser.js";

export default ({ components }) => {
  const ns = "file";
  components.push({
    body: [],
    sidebar: [
      {
        id: `${ns}:workspace-select`,
        label: "📁 Workspaces",
        order: 30,
        render: () => html`<workspace-select></workspace-select>`,
      },
      {
        id: `${ns}:browser`,
        label: "📁 Files",
        order: 30,
        render: () => html`<file-browser></file-browser>`,
      },
    ],
  });
};
