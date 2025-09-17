import schema from "../schemas/tasks.schema.js";
import { taskStore } from "../shared/TaskStore.js";

export const taskUpdate = {
  name: "taskUpdate",
  description: "Update a task by id",
  parameters: {
    type: "object",
    properties: {
      ...schema.properties,
      id: { type: "string" },
    },
    required: ["id"],
    additionalProperties: false,
  },

  async stub(values) {
    const { id, ...patch } = values ?? {};
    if (!id) throw new Error("taskUpdate.stub: id required");
    taskStore.applyLocalUpdate(id, patch);
  },

  async handler(values) {
    const { dbUpdate } = await import("@loki/db/util");
    const { id, ...patch } = values ?? {};
    const { item } = await dbUpdate({ table: "tasks", id, patch });
    return { item };
  },
};
