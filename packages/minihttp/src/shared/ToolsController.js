// src/ui/minihttp-controller.js
import { toolsService } from "./ToolsService.js";

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

  // state pass-throughs...
  get src() {
    return this.svc.src;
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

  // actions pass-throughs
  refreshTools(opts) {
    return this.svc.refreshTools(opts);
  }
  setTool(name) {
    return this.svc.setTool(name);
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

  // convenience
  async callNamed(name, args = {}) {
    return this.svc.callNamed(name, args);
  }
  async invokeNamed(name, args = {}) {
    return this.svc.invokeNamed(name, args);
  }

  // 🔧 FIX: accept + forward payload
  async resumePlan(checkpoint, payload = {}) {
    return this.svc.resumePlan(checkpoint, payload);
  }

  cancelPlan(checkpoint) {
    return this.svc.cancelPlan(checkpoint);
  }
}
