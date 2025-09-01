// src/ui/plugin.js
import { html } from "lit";
import "@loki/self-code-test/ui/task-list.js";
import "@loki/self-code-test/ui/task-viewer.js";
import "@loki/self-code-test/ui/colour-grid.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: `tasks:viewer`,
        label: "📝 Task",
        order: 10,
        render: () => html`<task-viewer></task-viewer>`,
      },
      {
        id: `tasks:list`,
        label: "📋 Tasks",
        order: 20,
        render: () => html`<task-list></task-list>`,
      },
      {
        id: `tasks:colours`,
        label: "🎨 Colour Grid",
        order: 30,
        render: () => html`<colour-grid></colour-grid>`,
      },
    ],
  });
};
