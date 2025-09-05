import { dbSelect, dbUpdate, dbInsert, dbDelete } from "@loki/db/util";

const TABLE = "todos";
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

export async function mountTodoRoute(args = {}) {
  const { op = "list", id = "", title = "", patch = {} } = args;

  try {
    if (op === "list") {
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { status: 200, json: { items: r?.items ?? [] } };
    }

    if (op === "create") {
      const now = Date.now();
      const item = { id: uuid(), title: String(title || "Untitled").trim(), done: false, createdAt: now, updatedAt: now };
      await dbInsert({ table: TABLE, values: item });
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { status: 200, json: { items: r?.items ?? [] } };
    }

    if (op === "update") {
      if (!id) return { status: 400, json: { error: "Missing id" } };
      const next = { ...patch, updatedAt: Date.now() };
      const rU = await dbUpdate({ table: TABLE, id, patch: next });
      if (!rU?.item) return { status: 404, json: { error: "Not found" } };
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { status: 200, json: { items: r?.items ?? [] } };
    }

    if (op === "toggle") {
      if (!id) return { status: 400, json: { error: "Missing id" } };
      const cur = await dbSelect({ table: TABLE, where: { id }, limit: 1, offset: 0, orderBy: null });
      const t = Array.isArray(cur?.items) ? cur.items[0] : null;
      if (!t) return { status: 404, json: { error: "Not found" } };
      const rU = await dbUpdate({ table: TABLE, id, patch: { done: !t.done, updatedAt: Date.now() } });
      if (!rU?.item) return { status: 404, json: { error: "Not found" } };
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { status: 200, json: { items: r?.items ?? [] } };
    }

    if (op === "delete") {
      if (!id) return { status: 400, json: { error: "Missing id" } };
      await dbDelete({ table: TABLE, id });
      const r = await dbSelect({ table: TABLE, where: {}, limit: 1000, offset: 0, orderBy: `"createdAt" DESC` });
      return { status: 200, json: { items: r?.items ?? [] } };
    }

    return { status: 400, json: { error: `Unknown op: ${op}` } };
  } catch (e) {
    return { status: 500, json: { error: String(e?.message || e) } };
  }
}
