
import { getGitStore } from "./GitStore.js";
import { getGitUIService, gitUIService as defaultSvc } from "./GitUIService.js";

/**
 * GitController
 * - Mirrors TaskController shape for convenience in UI components.
 */
export class GitController {
  constructor(host, opts = {}) {
    this.host = host;
    this.store = getGitStore();
    this.service = opts.service ?? getGitUIService() ?? defaultSvc;
    this.state = this.store.get();
    host.addController?.(this);
  }

  hostConnected() {
    this._unsub = this.store.subscribe((st) => {
      this.state = st;
      this.host.requestUpdate?.();
    });
  }
  hostDisconnected() { this._unsub?.(); }

  // selectors
  get selectedCommit() { return this.store.state.selectedCommit; }
  selectCommit = (hash) => this.store.selectCommit(hash);

  // passthroughs
  status = (ws) => this.service.status(ws);
  branches = (ws) => this.service.branches(ws);
  log = (ws, opts) => this.service.log(ws, opts);
  diff = (ws, opts) => this.service.diff(ws, opts);
  add = (ws, opts) => this.service.add(ws, opts);
  restore = (ws, opts) => this.service.restore(ws, opts);
  commit = (ws, opts) => this.service.commit(ws, opts);
  checkout = (ws, opts) => this.service.checkout(ws, opts);
  push = (ws, opts) => this.service.push(ws, opts);
  pull = (ws, opts) => this.service.pull(ws, opts);
  generateCommit = (ws, opts) => this.service.generateCommit(ws, opts);
}
