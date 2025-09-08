// src/ui/plugin.js
import { html } from "lit";
import "@loki/minihttp/ui/tool-select.js";
import "@loki/minihttp/ui/tool-viewer.js";
import "@loki/minihttp/ui/tool-directory.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: `tool-viewer`,
        label: "📁 Tools",
        order: 30,
        render: () => html`<tool-viewer></tool-viewer>`,
      },
      {
        id: `tool-directory`,
        label: "🧰 Tool Directory",
        order: 31,
        render: () => html`<tool-directory></tool-directory>`,
      },
    ],
    sidebar: [
      {
        id: `tool-select`,
        label: "📁 Tools",
        order: 30,
        render: () => html`<tool-select></tool-select>`,
      },
    ],
  });
};
