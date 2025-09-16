import schema from "../schemas/tasks.schema.js";
import { getTaskStore } from "../shared/TaskStore.js";
import { rpc } from "@loki/minihttp/util";

export const listTasks = {
  name: "listTasks",
  description: "List tasks",
  parameters: { type: "object", properties: {}, additionalProperties: false },

  async stub(_, { store = getTaskStore(), rpc: rpcArg = rpc } = {}) {
    const { items = [] } = await rpcArg.$callRemote("listTasks", {});
    store.replaceAll(items);
    return { items };
  },

  async handler(
    _,
    {
      /* db */
    } = {}
  ) {
    const { dbSelect } = await import("@loki/db/util");
    const { items } = await dbSelect({
      table: "tasks",
      where: {},
      orderBy: `"createdAt" DESC`,
      limit: 1000,
      offset: 0,
    });
    return { items: items ?? [] };
  },
};
