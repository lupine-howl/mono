// src/ui/minihttp-controller.js
import { toolsService } from "./ToolsService.js";

/**
 * Thin controller:
 *  - kicks service.sync()
 *  - re-broadcasts service "change" as `eventName` (default "tools:change")
 *  - pass-through getters & actions for UI
 */
export class ToolsController extends EventTarget {
  constructor({ service = toolsService, eventName = "tools:change" } = {}) {
    super();
    this.svc = service;
    this.eventName = eventName;

    this._onSvc = (e) => {
      this.dispatchEvent(
        new CustomEvent(this.eventName, {
          detail: e.detail,
          bubbles: true,
          composed: true,
        })
      );
    };
    this.svc.addEventListener("change", this._onSvc);

    this._ready = this.svc.sync();
  }

  ready() {
    return this._ready;
  }
  disconnect() {
    this.svc.removeEventListener("change", this._onSvc);
  }

  // ----- pass-through state -----
  get base() {
    return this.svc.base;
  }
  get src() {
    return this.svc.src;
  }
  get openapiUrl() {
    return this.svc.openapiUrl;
  }
  get method() {
    return this.svc.method;
  }
  get tools() {
    return this.svc.tools;
  }
  get toolName() {
    return this.svc.toolName;
  }
  get tool() {
    return this.svc.tool;
  }
  get schema() {
    return this.svc.schema;
  }
  get values() {
    return this.svc.values;
  }
  get loadingTools() {
    return this.svc.loadingTools;
  }
  get calling() {
    return this.svc.calling;
  }
  get result() {
    return this.svc.result;
  }
  get error() {
    return this.svc.error;
  }

  // ----- pass-through actions -----
  refreshTools(opts) {
    return this.svc.refreshTools(opts);
  }
  setTool(name, opts) {
    return this.svc.setTool(name, opts);
  }
  setMethod(m) {
    return this.svc.setMethod(m);
  }
  setValues(v) {
    return this.svc.setValues(v);
  }
  setValue(k, v) {
    return this.svc.setValue(k, v);
  }
  clearResult() {
    return this.svc.clearResult();
  }
  call() {
    return this.svc.call();
  }
}
