import schema from "../schemas/tasks.schema.js";
import { getTaskStore } from "../shared/TaskStore.js";
import { rpc } from "@loki/minihttp/util";

export const updateTask = {
  name: "updateTask",
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

  async stub(values, { store = getTaskStore(), rpc: rpcArg = rpc } = {}) {
    const { id, ...patch } = values ?? {};
    if (!id) throw new Error("updateTask.stub: id required");

    // optimistic
    const changed = store.applyLocalUpdate(id, patch);
    try {
      const { item } = await rpcArg.$callRemote("updateTask", { id, ...patch });
      if (item?.id) store.upsertOne(item, "server:update");
      return { item };
    } catch (e) {
      if (changed) await rpcArg.$callRemote("listTasks", {}); // cheap reconcile
      store.setError(e, { op: "updateTask", id });
      throw e;
    }
  },

  async handler(
    values,
    {
      /* db */
    } = {}
  ) {
    const { dbUpdate } = await import("@loki/db/util");
    const { id, ...patch } = values ?? {};
    const { item } = await dbUpdate({ table: "tasks", id, patch });
    return { item };
  },
};
