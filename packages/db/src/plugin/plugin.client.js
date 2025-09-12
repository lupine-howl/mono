// src/ui/plugin.js
import { html } from "lit";
import "@loki/db/ui/db-browser.js";
import "@loki/db/ui/db-viewer.js";

export default ({ components }) => {
  const ns = "db";
  components.push({
    sidebar: [
    ],
    body: [
      {
        id: `${ns}:viewer`,
        label: "📊 DB",
        order: 30,
        render: () => html`<db-viewer></db-viewer>`,
        left:[      {
        id: `${ns}:browser`,
        label: "🗄️ DB Browser",
        order: 30,
        render: () => html`<db-browser></db-browser>`,
      },
]
      },
    ],
  });
};
