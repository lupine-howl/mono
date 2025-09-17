import { TaskList, TaskViewer } from "@loki/tasksv2/ui";
import * as taskTools from "@loki/tasksv2/tools";
import { tasksSchema } from "@loki/tasksv2/schemas/tasks.schema.js";

export default ({ components, schemas, tools }) => {
  schemas.tasks = tasksSchema;
  tools.defineMany({ ...taskTools });
  components.push({
    body: [
      {
        id: `tasks:viewer`,
        label: "📋 Task",
        order: 20,
        wrapperStyle: "card",
        noTab: true,
        component: TaskViewer,
      },
      {
        id: `tasks:list`,
        label: "⌛ Tasks",
        order: 10,
        wrapperStyle: "card",
        component: TaskList,
      },
    ],
  });
};
