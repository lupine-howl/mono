import { tasksSchema } from "@loki/tasks/schemas/tasks.schema.js";

export default ({ schemas }) => {
  schemas.tasks = tasksSchema;
};
