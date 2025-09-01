// src/ui/project-viewer.js
import { LitElement, html, css } from "lit";
import { AIProjectController } from "../shared/AIProjectController.js";

import "@loki/layout/ui/smart-select.js";
import "@loki/ai-chat/ui/model-select.js"; // self-instantiating; updates chat
import "@loki/ai-chat/ui/attachment-picker.js"; // self-instantiating; emits attachments-change

const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export class ProjectViewer extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #e7e7ea;
    }
    .wrap {
      padding: 12px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
    }
    .grid {
      display: grid;
      gap: 10px 12px;
      grid-template-columns: 160px 1fr;
      align-items: start;
    }
    label {
      font-size: 12px;
      opacity: 0.85;
      padding-top: 6px;
    }
    input,
    textarea,
    select,
    .pill {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid #2a2a30;
      background: #0f0f12;
      color: inherit;
      font: inherit;
    }
    textarea {
      min-height: 96px;
    }
    .pill {
      display: inline-block;
      background: #111214;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .hint {
      font-size: 12px;
      opacity: 0.7;
      padding: 6px 0;
    }
    attachment-picker {
      display: block;
    }
  `;

  static properties = {
    // local mirrors of the selected project
    _projId: { state: true },
    _name: { state: true },
    _desc: { state: true },
    _model: { state: true },
    _persona: { state: true },
    _customInstructions: { state: true },
    _attachments: { state: true },
  };

  constructor() {
    super();

    // controller (singleton-backed)
    this.projectCtl = new AIProjectController(this);

    // seed from currently selected project
    const st = this.projectCtl.get() || {};
    const sel = (st.projects || []).find((x) => x.id === st.selectedId) || null;

    this._projId = sel?.id ?? null;
    this._name = sel?.name ?? "";
    this._desc = sel?.description ?? "";
    this._model = sel?.model ?? "";
    this._persona = sel?.persona ?? "";
    this._customInstructions = sel?.customInstructions ?? "";
    this._attachments = Array.isArray(sel?.attachments) ? sel.attachments : [];

    // keep local mirrors in sync with service
    this._unsub = this.projectCtl.subscribe((state) => {
      const selected =
        (state.projects || []).find((x) => x.id === state.selectedId) || null;
      this._projId = selected?.id ?? null;
      this._name = selected?.name ?? "";
      this._desc = selected?.description ?? "";
      this._model = selected?.model ?? "";
      this._persona = selected?.persona ?? "";
      this._customInstructions = selected?.customInstructions ?? "";
      this._attachments = Array.isArray(selected?.attachments)
        ? selected.attachments
        : [];
      this.requestUpdate();
    });

    // debounced project updates for text fields
    this._debounceUpdate = debounce((patch) => {
      if (!this._projId) return;
      this.projectCtl.update(this._projId, patch);
    }, 350);
  }

  disconnectedCallback() {
    this._unsub?.();
    this._unsub = null;
    super.disconnectedCallback();
  }

  // ---- handlers (persist to Project; Project service mirrors to Chat) ----
  _onNameInput = (e) => {
    this._name = e.target.value;
    this._debounceUpdate({ name: this._name || "Untitled" });
  };
  _onDescInput = (e) => {
    this._desc = e.target.value;
    this._debounceUpdate({ description: this._desc || null });
  };
  _onPersonaInput = (e) => {
    this._persona = e.target.value;
    this._debounceUpdate({ persona: this._persona || null });
  };
  _onCustomInput = (e) => {
    this._customInstructions = e.target.value;
    this._debounceUpdate({
      customInstructions: this._customInstructions || null,
    });
  };
  _onAttachmentsChange = (e) => {
    const val = Array.isArray(e.detail?.value) ? e.detail.value : [];
    this._attachments = val;
    // Store raw array on the project; service will push to chat
    this.projectCtl.update(this._projId, { attachments: val });
  };
  _onModelChange = (e) => {
    const val = String(e.detail?.value || "");
    this._model = val;
    // Persist model to the project; model-select will also update chat
    this.projectCtl.update(this._projId, { model: val || null });
  };

  render() {
    if (!this._projId) {
      return html`<div class="hint">Select or create a project to edit.</div>`;
    }

    return html`
      <div class="wrap">
        <div class="row">
          <span class="pill">Project ID: ${this._projId}</span>
        </div>

        <div class="grid">
          <label>Name</label>
          <input .value=${this._name} @input=${this._onNameInput} />

          <label>Description</label>
          <textarea .value=${this._desc} @input=${this._onDescInput}></textarea>

          <label>Model</label>
          <!-- Show current project value; persist on change -->
          <model-select
            .value=${this._model}
            @model-change=${this._onModelChange}
          ></model-select>

          <label>Persona</label>
          <textarea
            .value=${this._persona}
            @input=${this._onPersonaInput}
            placeholder="You are a helpful assistant."
          ></textarea>

          <label>Custom instructions</label>
          <textarea
            .value=${this._customInstructions}
            @input=${this._onCustomInput}
            placeholder="Add specific rules or preferences for this project…"
          ></textarea>

          <label>Attachments</label>
          <div>
            <attachment-picker
              .value=${this._attachments}
              @attachments-change=${this._onAttachmentsChange}
            ></attachment-picker>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("project-viewer")) {
  customElements.define("project-viewer", ProjectViewer);
}
