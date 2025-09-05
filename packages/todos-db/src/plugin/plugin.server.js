import { todosSchema } from "@loki/todos/schemas/todos.schema.js";
import { registerTodos } from "@loki/todos";

export default ({ schemas, regFunctions }) => {
  // Registering the schema under "todos" ensures the DB table "todos" exists (per your host behavior).
  schemas.todos = todosSchema;
  regFunctions.registerTodos = ({ router, tools }) => registerTodos({ router, tools });
};
