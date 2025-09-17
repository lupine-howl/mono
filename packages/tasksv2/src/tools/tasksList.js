import { taskStore } from "../shared/TaskStore.js";

export const tasksList = {
  name: "tasksList",
  description: "List tasks",
  parameters: { type: "object", properties: {}, additionalProperties: false },

  async stub(_, { result }) {
    if (result && result.items) {
      taskStore.replaceAll(result.items);
    }
    return { items: result?.items };
  },

  async handler() {
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
