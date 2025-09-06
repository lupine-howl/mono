import { getTodoStore } from "./TodoStore.js";
import { getTodoUIService, todoUIService as defaultSvc } from "./TodoUIService.js";

export class TodoController {
  constructor(host, opts = {}) {
    this.host = host;
    this.store = getTodoStore();
    this.service = opts.service ?? getTodoUIService(opts) ?? defaultSvc;
    this.state = this.store.get();
    host.addController?.(this);
  }
  hostConnected(){ this._unsub = this.store.subscribe((st)=>{ this.state = st; this.host.requestUpdate?.(); }); this.service.list(); }
  hostDisconnected(){ this._unsub?.(); }

  get selected(){ return this.state.items.find(t=>t.id===this.state.selectedId) ?? null; }
  select = (id) => this.store.select(id);

  add = (title) => this.service.create(title);
  toggle = (id) => this.service.toggle(id);
  remove = (id) => this.service.remove(id);
}
