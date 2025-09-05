// server entry
import { mountTodoRoute } from "./routes.js";
import { registerTodoTools } from "./tools.js";

/**
 * registerTodos({ router, tools }, opts)
 * - mounts a single POST RPC endpoint at /api/todos backed by DB
 * - registers AI tools: createTodo, deleteTodo
 * opts: { path?: string }
 */
export function registerTodos({ router, tools }, opts = {}) {
  const path = opts.path || "/api/todos";
  router.post(path, (args) => mountTodoRoute(args));
  if (tools) registerTodoTools(tools);
}
