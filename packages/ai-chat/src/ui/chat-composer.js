// src/ui/chat-composer.js
import { LitElement, html, css } from "lit";
import { AIChatController } from "../shared/AIChatController.js";
import "./chat-tool-select.js";

export class ChatComposer extends LitElement {
  static styles = css`
    .wrap {
      background: #303030;
      margin-bottom: 10px;
      border-radius: 28px;
      height: auto;
    }
    .button-wrap {
      position: relative;
      left: 10px;
      bottom: 10px;
      display: inline-block;
    }
    form {
      position: relative;
      left: 0px;
    }
    textarea {
      resize: none;
      background: transparent;
      color: inherit;
      font: inherit;
      line-height: 1.4;
      border: none;
      outline: none;
      overflow-y: hidden;
      min-height: 0;
      max-height: 200px;
      padding: 17px;
      padding-bottom: 0;
      padding-left: 14px;
      width: 90%;
    }
    :host(:not([multiline])) .wrap {
      height: 58px;
    }
    :host(:not([multiline])) .button-wrap {
      bottom: 52px;
    }
    :host(:not([multiline])) form {
      left: 30px;
    }
  `;
  static properties = {
    toolController: { attribute: false },
    disabled: { type: Boolean, reflect: true },
    _baseHeight: { state: true },
    _multiline: { state: true },
    _mode: { state: true },
    _loading: { state: true },
    _refocusAfterUpdate: { state: true },
  };

  constructor() {
    super();
    this.controller = new AIChatController();
    this.toolController = null;

    this._baseHeight = null;
    this.disabled = false;
    this._multiline = false; // start single-line
    this._mode = "off";
    this._loading = false;
    this._refocusAfterUpdate = false;

    // Mirror service state
    this.controller.subscribe((st, patch) => {
      if ("mode" in patch) this._mode = st.mode;
      if ("loading" in patch) this._loading = !!st.loading;
      // Safe even before render thanks to guarded _ta()
      if ("mode" in patch) this._recomputeMultiline();
      this.requestUpdate();
    });

    // Hydrate from current state (no recompute here to avoid pre-render access)
    const s = this.controller.get?.() ?? {};
    if (s.mode) this._mode = s.mode;
    if ("loading" in s) this._loading = !!s.loading;
  }

  updated() {
    this.toggleAttribute("multiline", this._multiline);
    if (this._refocusAfterUpdate) {
      this._focusTextareaSync();
      this._refocusAfterUpdate = false;
    }
  }

  render() {
    const isBusy = this.disabled || this._loading;
    return html`
      <div class="wrap">
        <form @submit=${this.onSubmit}>
          <textarea
            style="margin-left: 8px;"
            rows="1"
            name="prompt"
            placeholder="Type a message…"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            ?disabled=${isBusy}
            @input=${this.autoResize}
            @keydown=${this.onKeydown}
          ></textarea>
        </form>
        <div class="button-wrap">
          <chat-tool-select
            .controller=${this.controller}
            .toolController=${this.toolController}
          ></chat-tool-select>
        </div>
      </div>
    `;
  }

  firstUpdated() {
    const ta = this._ta();
    if (!ta) return;
    const cs = getComputedStyle(ta);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const brd =
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.borderBottomWidth) || 0);
    this._baseHeight = Math.ceil(line + pad + brd);
    ta.style.height = this._baseHeight + "px";
    this._focusTextareaSync();

    // Now it's safe to compute based on the textarea
    this._recomputeMultiline();
  }

  // SAFE now: won’t throw pre-render
  _ta() {
    return this.renderRoot?.querySelector?.("textarea") ?? null;
  }

  _focusTextareaSync() {
    const ta = this._ta();
    if (!ta || ta.hasAttribute("disabled")) return;
    ta.focus({ preventScroll: true });
    const end = ta.value.length;
    try {
      ta.setSelectionRange(end, end);
    } catch {}
  }

  autoResize = (e) => {
    const ta = e.target;
    if (this._baseHeight == null) this.firstUpdated();
    this._recomputeMultiline(ta.value);

    ta.style.height = "auto";
    const needed = Math.min(ta.scrollHeight, 200);
    ta.style.height =
      (needed > this._baseHeight ? needed : this._baseHeight) + "px";
  };

  onKeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  _recomputeMultiline(currentText) {
    const val = currentText ?? this._ta()?.value ?? "";
    const hasNewline = val.includes("\n") || val.length > 88;
    this._multiline = hasNewline || this._mode !== "off";
  }

  onSubmit = (e) => {
    e.preventDefault();

    const ta = this._ta();
    const fd = new FormData(e.target);
    const prompt = String(fd.get("prompt") || "").trim();
    if (!prompt) {
      this._focusTextareaSync();
      return;
    }

    e.target.reset();
    if (ta) ta.style.height = (this._baseHeight ?? 0) + "px";

    this.controller.submit(prompt);

    this._focusTextareaSync();
    this._refocusAfterUpdate = true;
    this._recomputeMultiline("");
  };
}

if (!customElements.get("chat-composer")) {
  customElements.define("chat-composer", ChatComposer);
}
