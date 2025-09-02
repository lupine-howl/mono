// src/ui/plugin.js
import { html } from "lit";
import "@loki/file-viewer-advanced/ui/file-viewer-advanced.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: `code`,
        label: "📄 Code",
        order: 30,
        render: () => html`<file-viewer-advanced></file-viewer-advanced>`,
      },
    ],
  });
};
