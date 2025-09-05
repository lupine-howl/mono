import { getGlobalSingleton } from "@loki/utilities";
import { getTodoStore } from "./TodoStore.js";

export class TodoUIService {
  constructor({ endpoint = "/api/todos" } = {}) {
    this.endpoint = endpoint;
    this.pk = "id";
    this.store = getTodoStore();
  }
  async _call(body){
    const r = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const j = await r.json();
    return Array.isArray(j?.items) ? j.items : [];
  }
  async list(){ this.store.replaceAll(await this._call({ op: "list" })); }
  async create(title){ this.store.replaceAll(await this._call({ op: "create", title })); }
  async toggle(id){ this.store.replaceAll(await this._call({ op: "toggle", id })); }
  async remove(id){ this.store.replaceAll(await this._call({ op: "delete", id })); }
}

export function getTodoUIService(opts = {}){
  return getGlobalSingleton(Symbol.for("@loki/todos:ui-service@1"), () => new TodoUIService(opts));
}
export const todoUIService = getTodoUIService();
