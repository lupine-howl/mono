// src/ui/plugin.js
import { html } from "lit";
import "@loki/minihttp/ui/tool-list.js";
import "@loki/minihttp/ui/tool-viewer.js";
import "@loki/minihttp/ui/tool-directory.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: `tool-viewer`,
        label: "📁 Tools",
        order: 30,
        noTab: true,
        render: () => html`<tool-viewer></tool-viewer>`,
        left: [
          {
            id: `tool-list`,
            label: "📁 Tools",
            order: 30,
            render: () => html`<tool-list></tool-list>`,
          },
        ],
      },
      {
        id: `tool-directory`,
        label: "🧰 Tool Directory",
        order: 31,
        render: () => html`<tool-directory></tool-directory>`,
        left: [
          {
            id: `tool-list`,
            label: "📁 Tools",
            order: 30,
            render: () => html`<tool-list></tool-list>`,
          },
        ],
      },
    ],
  });
};
