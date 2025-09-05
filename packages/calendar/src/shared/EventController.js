import { getEventStore } from "./EventStore.js";
import { getEventUIService, eventUIService as defaultSvc } from "./EventUIService.js";

export class EventController {
  constructor(host, opts = {}) {
    this.host = host;
    this.store = getEventStore();
    this.service = opts.service ?? getEventUIService(opts) ?? defaultSvc;
    this.state = this.store.get();
    host.addController?.(this);
  }
  hostConnected(){ this._unsub = this.store.subscribe((st)=>{ this.state = st; this.host.requestUpdate?.(); }); this.service.list(); }
  hostDisconnected(){ this._unsub?.(); }

  get selected(){ return this.state.items.find(e=>e.id===this.state.selectedId) ?? null; }
  select = (id) => this.store.select(id);

  list = (opts) => this.service.list(opts);
  createOne = (input) => this.service.createOne(input);
  createMany = (events, opts) => this.service.createMany(events, opts);
  update = (id, patch) => this.service.update(id, patch);
  remove = (id) => this.service.remove(id);
}
