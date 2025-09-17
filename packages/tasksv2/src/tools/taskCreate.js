// src/tools/taskCreate.js
import tasksSchema from "../schemas/tasks.schema.js";
import { taskStore } from "../shared/TaskStore.js";

function slugify(s, max = 80) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, max);
}

export const taskCreate = {
  name: "taskCreate",
  description: "Create a new task",
  parameters: { ...tasksSchema, additionalProperties: false },

  async stub(values, { result }) {
    // optimistic: if server already responded, prefer that; else stage a local
    const item = result?.item ?? { ...values, id: crypto.randomUUID() };
    taskStore.addLocal(item, { select: true });
    return { ok: true, data: { item } };
  },

  async handler(values /*, ctx */) {
    const { dbInsert } = await import("@loki/db/util");
    const { item } = await dbInsert({ table: "tasks", values });
    // TODO: reconcile optimistic -> server result if needed
    return { ok: true, data: { item } };
  },
};

// Generic chain runner expects steps = [{ tool, label?, with?: fn | object }]
// - `label` stores each step's result under ctx[label]
// - `with` can be an object (static args) or function (ctx => args)
// Runner would call tools[...] accordingly.
//
// Example chain tool:
export const taskCreateThenCreateImage = {
  name: "taskCreateThenCreateImage",
  description: "Create a task, then generate & download an image for it",
  parameters: taskCreate.parameters,

  // Plan returns an array of steps. Each step can reference prior outputs via ctx.
  plan(values) {
    return [
      {
        tool: "taskCreate",
        label: "task",
        input: values, // pass through original args
      },
      {
        tool: "aiGenerateImage",
        label: "image",
        input: (ctx) => {
          const title = ctx.task?.data?.item?.title ?? values.title;
          return {
            prompt: title,
            filename: slugify(title),
          };
        },
      },
      {
        tool: "fsDownload",
        label: "download",
        input: (ctx) => {
          console.log(ctx);
          const title = ctx.task?.data?.item?.title ?? values.title;
          return {
            ws: "images",
            url: ctx.image?.image?.url,
            to: `${slugify(title)}.png`,
          };
        },
        output: (ctx) => ({
          kind: "image",
          ws: "images",
          path: ctx?.download?.data?.to,
          mime: ctx?.image?.mime,
        }),
      },
    ];
  },
};
