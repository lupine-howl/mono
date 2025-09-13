// src/ui/plugin.js
import { html } from "lit";
import "@loki/file-viewer-advanced/ui/file-viewer-advanced.js";
import "@loki/file-browser/ui/workspace-select.js";
import "@loki/file-browser/ui/file-browser.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: `code`,
        label: "모 Code",
        order: 30,
        render: () => html`<file-viewer-advanced></file-viewer-advanced>`,
        left: [
          {
            id: `code:workspace-select`,
            label: "📁 Workspaces",
            order: 30,
            render: () => html`<workspace-select></workspace-select>`,
          },
          {
            id: `code:browser`,
            label: "📁 Files",
            order: 30,
            render: () => html`<file-browser></file-browser>`,
          },
        ],
      },
    ],
  });
};
