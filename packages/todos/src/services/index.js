// server entry
import { registerTodoTools } from "./tools.js";
import { handleTodos } from "./routes.js";

/**
 * registerTodos({ router, tools }, opts)
 * - mounts a single POST RPC endpoint at /api/todos
 * - registers two AI tools: createTodo, deleteTodo
 */
export function registerTodos({ router, tools }, opts = {}) {
  const path = opts.path || "/api/todos";
  router.post(path, (args) => handleTodos(args, opts));
  if (tools) registerTodoTools(tools, opts);
}
