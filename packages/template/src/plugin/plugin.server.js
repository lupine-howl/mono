import { todosSchema } from "@loki/template/schemas/todos.schema.js";
import { registerPings, registerTodoTools } from "@loki/template";

export default ({ schemas, regFunctions }) => {
  // Registering the schema ensures the DB creates the "todos" table.
  schemas.todos = todosSchema;
  // Register generic DB tools + ensure table (no model-specific routes).
  regFunctions.registerPings = ({ router }) => registerPings({ router });
  regFunctions.registerTodoTools = ({ tools }) => registerTodoTools(tools);
};
