// src/tools/createTask.js
import tasksSchema from "../schemas/tasks.schema.js"; // default export is fine
import { getTaskStore } from "../shared/TaskStore.js";
import { toolRegistry as rpc } from "@loki/minihttp/util";

// Small normaliser to ensure timestamps and ids exist.
// (Server will still persist/override as needed.)
function withDefaults(values) {
  const now = Date.now();
  const id =
    values?.id ??
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);
  return {
    id,
    title: (values?.title ?? "Untitled task").trim(),
    notes: values?.notes ?? "",
    done: !!values?.done,
    due: values?.due ?? null, // ISO or null
    workspaceId: values?.workspaceId ?? "",
    toolId: values?.toolId ?? "",
    createdAt: values?.createdAt ?? now,
    updatedAt: now,
  };
}

export const createTask = {
  name: "createTask",
  description: "Create a new task",
  // Keep schema as parameters, but disallow random props
  parameters: { ...tasksSchema, additionalProperties: false },

  // ---- CLIENT: optimistic flow ----
  async stub(values) {
    const store = getTaskStore({ table: "tasks" });
    // Build an optimistic local row
    const local = store.addLocal(withDefaults(values), { select: true });

    try {
      // Call the server tool
      //const { item: serverItem } = await rpc.$call("createTask", local);

      if (!serverItem || !serverItem.id) {
        throw new Error("createTask: server returned no item");
      }

      // If server changed id or any fields, reconcile
      const pk = "id";
      if (serverItem[pk] !== local[pk]) {
        const rest = store.get().tasks.filter((t) => t[pk] !== local[pk]);
        store.replaceAll([serverItem, ...rest]);
      } else {
        store.upsertOne(serverItem, "server:confirm");
      }
      store.select(serverItem[pk]);

      return { item: serverItem };
    } catch (e) {
      // Roll back optimistic insertion
      const pk = "id";
      const after = store.get().tasks.filter((t) => t[pk] !== local[pk]);
      store.replaceAll(after);
      store.setError(e, { op: "createTask", id: local.id });
      throw e;
    }
  },

  // ---- SERVER: persist in the DB ----
  async handler(values /*, ctx */) {
    // Use dynamic import to avoid bundlers pulling DB into browser builds
    const { dbInsert } = await import("@loki/db/util");

    // Trust DB to set/override fields if needed, but provide sensible defaults
    const row = withDefaults(values);

    // Your dbInsert elsewhere uses an object shape. Keeping consistent:
    //   dbInsert({ table, values }) -> { item }
    const { item } = await dbInsert({ table: "tasks", values: row });

    // If your dbInsert returns the row directly, adapt to: const item = await dbInsert(...)
    return { item };
  },
};
