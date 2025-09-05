import { dbInsert, dbDelete, dbSelect } from "@loki/db/util";

const TABLE = "todos";
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

/** AI Tools: createTodo, deleteTodo (DB-backed) */
export function registerTodoTools(tools) {
  tools.define({
    name: "createTodo",
    description: "Create a todo with a title",
    parameters: { type: "object", required: ["title"], properties: { title: { type: "string" } }, additionalProperties: false },
    handler: async ({ title }) => {
      const now = Date.now();
      const item = { id: uuid(), title: String(title || "Untitled").trim(), done: false, createdAt: now, updatedAt: now };
      await dbInsert({ table: TABLE, values: item });
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { created: true, items: r?.items ?? [] };
    },
    tags: ["Todos", "DB"]
  });

  tools.define({
    name: "deleteTodo",
    description: "Delete a todo by id",
    parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } }, additionalProperties: false },
    handler: async ({ id }) => {
      await dbDelete({ table: TABLE, id });
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { deleted: true, items: r?.items ?? [] };
    },
    tags: ["Todos", "DB"]
  });
}
