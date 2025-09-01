import { LitElement, html, css } from "lit";

export class SmartSelect extends LitElement {
  static properties = {
    name: { type: String, reflect: true },
    value: { type: String }, // bound externally
    disabled: { type: Boolean, reflect: true },
    _label: { state: true },
    mode: { type: String, reflect: true },
  };

  static styles = css`
    :host {
      display: inline-block;
      font: inherit;
    }
    .wrap {
      position: relative;
      display: inline-block;
      width: fit-content;
    }
    .face {
      display: inline-flex;
      align-items: baseline;
      gap: 0.35em;
      white-space: nowrap;
      color: var(--select-fg, #e7e7ea);
      border-radius: 0.5rem;
      padding: 0.35rem 0.5rem;
      line-height: 1.1;
      user-select: none;
    }
    :host(:hover) .face {
      background: var(--select-hover-bg, rgba(255, 255, 255, 0.1));
    }
    .caret {
      line-height: 1;
    }
    .native {
      position: absolute;
      inset: 0;
      opacity: 0;
      appearance: none;
      border: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    ::slotted(option) {
      display: none;
    }
    .more-button,
    .menu-button {
      border: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      width: 40px;
      border-radius: 999px;
      background: rgba(125, 125, 125, 0);
      padding: 0;
      line-height: 0;
    }
    .more-button {
      height: 40px;
      font-size: 30px;
      padding-bottom: 6px;
    }
    :host(:hover) .more-button {
      background: rgba(125, 125, 125, 0.2);
    }
  `;

  constructor() {
    super();
    this.name = "";
    this._value = ""; // internal backing field
    this.disabled = false;
    this._label = "";
    this.mode = "text";
    this._squelch = false; // suppress event dispatch during programmatic sets
  }

  // public value <-> internal _value
  get value() {
    return this._value;
  }
  set value(v) {
    const next = (v ?? "").toString();
    if (next === this._value) return;
    const old = this._value;
    this._value = next;
    this.requestUpdate("value", old);
  }

  render() {
    return html`
      <div class="wrap" aria-haspopup="listbox">
        ${this.mode == "button"
          ? html`<button class="more-button">+</button>`
          : this.mode == "menu"
          ? html`<button class="menu-button">⋯</button>`
          : html`<div class="face">
              <span>${this._label}</span><span class="caret">▾</span>
            </div>`}

        <select
          class="native"
          name=${this.name || ""}
          ?disabled=${this.disabled}
          @change=${this._onNativeChange}
        ></select>
      </div>

      <slot @slotchange=${this._syncOptions}></slot>
    `;
  }

  firstUpdated() {
    this._selectEl = this.renderRoot.querySelector("select.native");
    this._syncOptions();
    // apply initial external value (or default to first option)
    if (this._hasValue(this._value)) {
      this._applyValueToNative(this._value, /*silent*/ true);
    } else if (!this._selectEl.value && this._selectEl.options.length) {
      this._applyValueToNative(
        this._selectEl.options[0].value,
        /*silent*/ true
      );
    }
    this._updateLabel();
  }

  updated(changed) {
    // reflect external .value changes to native select without emitting
    if (changed.has("value")) {
      if (this._selectEl && this._hasValue(this._value)) {
        this._applyValueToNative(this._value, /*silent*/ true);
      }
      this._updateLabel();
    }
  }

  _syncOptions = () => {
    if (!this._selectEl) return;
    const opts = this.shadowRoot
      .querySelector("slot")
      .assignedElements({ flatten: true })
      .filter((n) => n.tagName === "OPTION");

    this._selectEl.innerHTML = "";
    for (const opt of opts) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.text = opt.label || opt.textContent || "";
      o.disabled = !!opt.disabled;
      o.selected = !!opt.selected;
      this._selectEl.add(o);
    }

    // keep native in sync with current value, silently
    if (this._hasValue(this._value)) {
      this._applyValueToNative(this._value, /*silent*/ true);
    }
    this._updateLabel();
  };

  _onNativeChange = (e) => {
    // Only emit when it's really a user-initiated change and value actually changed
    if (this._squelch) return;
    if (e && e.isTrusted === false) return;

    const v = this._selectEl.value;
    if (v === this._value) return;

    this._value = v;
    this._updateLabel();

    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  };

  _applyValueToNative(v, silent = false) {
    if (!this._selectEl) return;
    if (!this._hasValue(v)) return;
    if (this._selectEl.value === v) return;
    this._squelch = !!silent;
    this._selectEl.value = v;
    this._squelch = false;
  }

  _updateLabel() {
    const opt = this._selectEl?.selectedOptions?.[0];
    this._label = opt ? opt.text : "";
  }

  _hasValue(v) {
    return (
      !!this._selectEl &&
      Array.from(this._selectEl.options).some((o) => o.value === v)
    );
  }

  // convenience for callers that want a guaranteed silent reset
  setValue(val, { silent = false } = {}) {
    this.value = val ?? "";
    if (this._selectEl) this._applyValueToNative(this.value, silent);
    this._updateLabel();
  }
}

if (!customElements.get("smart-select"))
  customElements.define("smart-select", SmartSelect);
