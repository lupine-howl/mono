// src/ui/plugin.js
import { html } from "lit";
import "@loki/tasks/ui/task-list.js";
import "@loki/tasks/ui/task-viewer.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: `tasks:viewer`,
        label: "📝 Task",
        order: 20,
        render: () => html`<task-viewer></task-viewer>`,
      },
      {
        id: `tasks:list`,
        label: "📋 Tasks",
        order: 10,
        render: () => html`<task-list></task-list>`,
      },
    ],
  });
};
