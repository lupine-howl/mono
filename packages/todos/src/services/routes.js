import { readTodos, writeTodos } from "./fileStore.js";

const uuid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export async function handleTodos(args = {}, storeOpts = {}) {
  const { op = "list", id = "", title = "", patch = {} } = args;
  let items = await readTodos(storeOpts);

  try {
    if (op === "list") {
      // no-op
    } else if (op === "create") {
      const now = Date.now();
      const todo = { id: uuid(), title: String(title || "Untitled").trim(), done: false, createdAt: now, updatedAt: now };
      items = [todo, ...items];
      await writeTodos(items, storeOpts);
    } else if (op === "update") {
      const idx = items.findIndex((t) => t.id === id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...patch, updatedAt: Date.now() };
        await writeTodos(items, storeOpts);
      }
    } else if (op === "toggle") {
      const idx = items.findIndex((t) => t.id === id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], done: !items[idx].done, updatedAt: Date.now() };
        await writeTodos(items, storeOpts);
      }
    } else if (op === "delete") {
      const next = items.filter((t) => t.id !== id);
      if (next.length !== items.length) {
        items = next;
        await writeTodos(items, storeOpts);
      }
    } else {
      return { status: 400, json: { error: `Unknown op: ${op}` } };
    }

    return { status: 200, json: { items } };
  } catch (e) {
    return { status: 500, json: { error: String(e?.message || e) } };
  }
}
