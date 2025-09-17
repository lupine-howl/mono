// src/shared/TaskController.js (unchanged shape)
import { getTaskStore } from "./TaskStore.js";
import { toolRegistry as rpc } from "@loki/minihttp/util";

export class TaskController {
  constructor(host) {
    this.host = host;
    this.store = getTaskStore();
    this.state = this.store.get();
    host.addController?.(this);
  }
  hostConnected() {
    this._unsub = this.store.subscribe((st) => {
      this.state = st;
      this.host.requestUpdate?.();
    });
    this.list();
  }
  hostDisconnected() {
    this._unsub?.();
  }

  select = (id) => this.store.select(id);

  // call tools directly by name (your goal)
  list = () => rpc.$call("tasksList", {});
  add = (p) => rpc.$call("taskCreate", p);
  update = (id, patch) => rpc.$call("taskUpdate", { id, ...patch });
  toggle = (id) => {
    const t = this.store.get().tasks.find((x) => x.id === id);
    if (t) return this.update(id, { done: !t.done });
  };
  remove = (id) => rpc.$call("taskDelete", { id });
}
