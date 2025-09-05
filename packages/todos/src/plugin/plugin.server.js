import { todosSchema } from "@loki/todos/schemas/todos.schema.js";
import { registerTodos } from "@loki/todos";

export default ({ schemas, regFunctions }) => {
  schemas.todos = todosSchema;
  regFunctions.registerTodos = ({ router, tools }) => registerTodos({ router, tools });
};
