// src/ui/plugin.js
import { html } from "lit";
import "@loki/tasksv2/ui/task-list.js";
import "@loki/tasksv2/ui/task-viewer.js";
import { rpc } from "@loki/minihttp/util";
import { createTask } from "@loki/tasksv2/tools/createTask.js";
import { listTasks } from "@loki/tasksv2/tools/listTasks.js";
import { updateTask } from "@loki/tasksv2/tools/updateTask.js";
import { deleteTask } from "@loki/tasksv2/tools/deleteTask.js";

export function registerTaskToolStubs() {
  for (const t of [createTask, listTasks, updateTask, deleteTask]) {
    if (typeof t?.stub === "function") rpc.registerStub(t.name, t.stub);
  }
}

export default ({ components }) => {
  registerTaskToolStubs();
  components.push({
    body: [
      {
        id: `tasks:viewer`,
        label: "📋 Task",
        order: 20,
        wrapperStyle: "card",
        noTab: true,
        render: () => html`<task-viewer></task-viewer>`,
      },
      {
        id: `tasks:list`,
        label: "⌛ Tasks",
        order: 10,
        wrapperStyle: "card",
        render: () => html`<task-list></task-list>`,
      },
    ],
  });
};
