import { getGlobalSingleton } from "@loki/utilities";

export class TodoStore {
  constructor() {
    this.state = { items: [], selectedId: null };
    this._subs = new Set();
  }
  get(){ return this.state; }
  subscribe(fn){ this._subs.add(fn); queueMicrotask(()=>fn(this.state)); return ()=>this._subs.delete(fn); }
  _emit(){ for(const fn of this._subs) fn(this.state); }

  replaceAll(items){
    const selectedId = items[0]?.id ?? null;
    this.state = { items, selectedId };
    this._emit();
  }
  select(id){
    if(this.state.selectedId !== id){
      this.state = { ...this.state, selectedId: id };
      this._emit();
    }
  }
}

export function getTodoStore(){
  return getGlobalSingleton(Symbol.for("@loki/todos:store@1"), () => new TodoStore());
}
export const todoStore = getTodoStore();
