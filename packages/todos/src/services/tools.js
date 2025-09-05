import { handleTodos } from "./routes.js";

/** Register two tiny AI tools that call the same server logic. */
export function registerTodoTools(tools, storeOpts = {}) {
  tools.define({
    name: "createTodo",
    description: "Create a todo with a title",
    parameters: { type: "object", required: ["title"], properties: { title: { type: "string" } }, additionalProperties: false },
    handler: async ({ title }) => {
      const r = await handleTodos({ op: "create", title }, storeOpts);
      if (r.status !== 200) throw new Error(r.json?.error || "create failed");
      return { created: true, items: r.json.items };
    },
    tags: ["Todos"]
  });

  tools.define({
    name: "deleteTodo",
    description: "Delete a todo by id",
    parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } }, additionalProperties: false },
    handler: async ({ id }) => {
      const r = await handleTodos({ op: "delete", id }, storeOpts);
      if (r.status !== 200) throw new Error(r.json?.error || "delete failed");
      return { deleted: true, items: r.json.items };
    },
    tags: ["Todos"]
  });
}
