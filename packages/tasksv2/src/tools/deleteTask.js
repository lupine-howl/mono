import { getTaskStore } from "../shared/TaskStore.js";
import { toolRegistry as rpc } from "@loki/minihttp/util";

export const deleteTask = {
  name: "deleteTask",
  description: "Delete a task by id",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },

  async stub({ id }, { store = getTaskStore(), rpc: rpcArg = rpc } = {}) {
    if (!id) throw new Error("deleteTask.stub: id required");
    const snapshot = store.get().tasks;
    store.removeOne(id, "local:remove");
    try {
      //await rpcArg.$call("deleteTask", { id });
      return { ok: true };
    } catch (e) {
      store.revertRemove(snapshot, id);
      store.setError(e, { op: "deleteTask", id });
      throw e;
    }
  },

  async handler(
    { id },
    {
      /* db */
    } = {}
  ) {
    const { dbDelete } = await import("@loki/db/util");
    await dbDelete({ table: "tasks", id });
    return { ok: true };
  },
};
