// mirrors calendar EventController
import { getTaskStore } from "./TaskStore.js";
import {
  getTaskUIService,
  taskUIService as defaultSvc,
} from "./TaskUIService.js";

export class TaskController {
  constructor(host, opts = {}) {
    this.host = host;
    this.store = getTaskStore({ table: opts.table ?? "tasks" });
    this.service = opts.service ?? getTaskUIService(opts) ?? defaultSvc;
    this.state = this.store.get();
    host.addController?.(this);
  }
  hostConnected() {
    this._unsub = this.store.subscribe((st) => {
      this.state = st;
      this.host.requestUpdate?.();
    });
    this.service.list();
  }
  hostDisconnected() {
    this._unsub?.();
  }

  // selectors
  get selected() {
    return this.store.selected;
  }
  select = (id) => this.store.select(id);

  // service passthroughs
  list = (opts) => this.service.list(opts);
  add = (p) => this.service.add(p);
  update = (id, patch) => this.service.update(id, patch);
  toggle = (id) => this.service.toggle(id);
  remove = (id) => this.service.remove(id);
}
