import { tasksSchema } from "@loki/tasksv2/schemas/tasks.schema.js";
import { loadToolsFromDir } from "@loki/minihttp";
import { toolRegistry } from "@loki/minihttp/util";

export default async ({ schemas, tools }) => {
  schemas.tasks = tasksSchema;
  const toolsDirUrl = new URL("../tools/", import.meta.url);
  const toolDefs = await loadToolsFromDir(toolsDirUrl);
  toolRegistry.defineMany(toolDefs);
};
