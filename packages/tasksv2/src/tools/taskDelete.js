import { taskStore } from "../shared/TaskStore.js";

export const taskDelete = {
  name: "taskDelete",
  description: "Delete a task by id",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },

  async stub({ id }) {
    if (!id) throw new Error("taskDelete.stub: id required");
    taskStore.removeOne(id, "local:remove");
  },

  async handler({ id }) {
    const { dbDelete } = await import("@loki/db/util");
    await dbDelete({ table: "tasks", id });
    return { ok: true };
  },
};
