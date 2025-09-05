import { LitElement, html, css } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { TodoController } from "../shared/lib/TodoController.js";

class TodoList extends LitElement {
  static styles = css`
    :host{display:block}
    form, .row { display:flex; gap:8px; align-items:center; }
    input, button { padding:8px 10px; border-radius:10px; border:1px solid #2a2a30; background:#0b0b0c; color:inherit; font:inherit; }
    button { cursor:pointer; background:#1b1b1f; }
    ul{list-style:none; padding:0; margin:10px 0; display:grid; gap:6px;}
    li{display:flex; gap:8px; align-items:center; padding:8px; border:1px solid #1f1f22; border-radius:10px; background:#0f0f12;}
    .title{flex:1 1 auto;}
    .done{opacity:.6; text-decoration: line-through;}
  `;
  static properties = { _draft: {state:true} };
  constructor(){ super(); this.ctrl = new TodoController(this); this._draft = ""; }

  render(){
    const items = this.ctrl.state.items ?? [];
    return html`
      <form @submit=${e=>{e.preventDefault(); const t=(this._draft||"").trim(); if(t){ this.ctrl.add(t); this._draft=""; }}}>
        <input placeholder="Add a todo…" .value=${this._draft} @input=${e=>this._draft=e.target.value} />
        <button ?disabled=${!(this._draft||"").trim()}>Add</button>
      </form>

      <ul>
        ${repeat(items, it=>it.id, it=>html`
          <li @click=${()=>this.ctrl.select(it.id)}>
            <input type="checkbox" .checked=${!!it.done} @click=${e=>e.stopPropagation()} @change=${()=>this.ctrl.toggle(it.id)} />
            <div class="title ${it.done?'done':''}">${it.title}</div>
            <button title="Remove" @click=${e=>{e.stopPropagation(); this.ctrl.remove(it.id);}}>✕</button>
          </li>
        `)}
      </ul>
    `;
  }
}

if(!customElements.get("todo-list")) customElements.define("todo-list", TodoList);
