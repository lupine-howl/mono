// src/controllers/FileBrowserController.js
import { fileBrowserService } from "./FileBrowserService.js";

export class FileBrowserController extends EventTarget {
  constructor({
    service = fileBrowserService,
    eventName = "files:change",
  } = {}) {
    super();
    this.svc = service;
    this.eventName = eventName;

    // pipe service -> controller
    this._onSvc = (e) => this._rebroadcast(e.detail);
    this.svc.addEventListener("change", this._onSvc);

    // hydrate (service owns localStorage)
    this._ready = this.svc.sync();
  }

  ready() {
    return this._ready;
  }
  disconnect() {
    this.svc.removeEventListener("change", this._onSvc);
  }

  // ----- re-broadcast service changes for UI listeners -----
  _rebroadcast(detail) {
    this.dispatchEvent(
      new CustomEvent(this.eventName, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  // ----- pass-throughs -----
  get workspaces() {
    return this.svc.workspaces;
  }
  get ws() {
    return this.svc.ws;
  }
  get cwd() {
    return this.svc.cwd;
  }
  get selection() {
    return this.svc.selection;
  }

  setWorkspace(id) {
    this.svc.setWorkspace(id);
  }
  setCwd(path) {
    this.svc.setCwd(path);
  }
  select(path, type = "file") {
    this.svc.select(path, type);
  }

  list(rel) {
    return this.svc.list(rel);
  }
  read(path) {
    return this.svc.read(path);
  }
  bundle(opts) {
    return this.svc.bundle(opts);
  }
  snapshot(opts) {
    return this.svc.snapshot(opts);
  }
  write(path, c) {
    return this.svc.write(path, c);
  }
  apply(files) {
    return this.svc.apply(files);
  }
  mkdir(path, r) {
    return this.svc.mkdir(path, r);
  }
  rename(from, to) {
    return this.svc.rename(from, to);
  }
  move(from, to) {
    return this.svc.move(from, to);
  }
  delete(paths, o) {
    return this.svc.delete(paths, o);
  }
  copy(from, to, o) {
    return this.svc.copy(from, to, o);
  }
  touch(path) {
    return this.svc.touch(path);
  }
}
