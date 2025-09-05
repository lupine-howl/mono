import { html } from "lit";
import "@loki/todos/ui/todo-list.js";

export default ({ components }) => {
  components.push({
    body: [
      { id: "todos:list", label: "Todos", order: 10, wrapperStyle: "card", render: () => html`<todo-list></todo-list>` }
    ]
  });
};
