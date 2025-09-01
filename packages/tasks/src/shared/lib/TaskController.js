// controllers/task-controller.js
import {
  getTaskService,
  taskService as defaultTaskService,
} from "./TaskService.js";

export class TaskController {
  constructor(host, opts = {}) {
    this.host = host;
    this.service = opts.service ?? getTaskService(opts) ?? defaultTaskService;
    this.state = this.service.get();
    host.addController?.(this);
  }
  hostConnected() {
    this._unsub = this.service.subscribe((st) => {
      this.state = st;
      this.host.requestUpdate();
    });
  }
  hostDisconnected() {
    this._unsub?.();
  }

  // passthroughs
  get selected() {
    return this.service.selected;
  }
  ready = () => this.service.ready();
  sync = () => this.service.sync();
  select = (id) => this.service.select(id);
  add = (p) => this.service.add(p);
  update = (id, patch) => this.service.update(id, patch);
  toggle = (id) => this.service.toggle(id);
  remove = (id) => this.service.remove(id);
  getError = () => this.service.getError();
}
