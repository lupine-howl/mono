// src/tools/taskCreate.js
import tasksSchema from "../schemas/tasks.schema.js"; // default export is fine
import { taskStore } from "../shared/TaskStore.js";

export const taskCreate = {
  name: "taskCreate",
  description: "Create a new task",
  parameters: { ...tasksSchema, additionalProperties: false },

  async stub(_, { result }) {
    if (result && result.item) {
      taskStore.addLocal(result.item, { select: true });
    }
    return result;
  },

  async handler(values /*, ctx */) {
    const { dbInsert } = await import("@loki/db/util");
    const { item } = await dbInsert({ table: "tasks", values });
    return { item };
  },
};
