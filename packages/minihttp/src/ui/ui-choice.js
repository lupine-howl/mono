import { LitElement, html, css } from "lit";

/**
 * <ui-choice>
 * Props:
 *  - message: string | string[]
 *  - actions?: Array<{ label: string, args?: any }>
 *  - options?: string[]   // fallback if actions aren't provided
 *
 * Events:
 *  - "choose" (bubbles, composed): detail is the resume payload
 *      { choice: string, choiceIndex: number, ...action.args }
 */
export class UiChoice extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .choice {
      display: grid;
      gap: 16px;
      padding: 8px 6px;
    }

    .message {
      font-size: clamp(18px, 2.2vw, 20px);
      line-height: 1.6;
      color: #e9eaed;
      white-space: pre-wrap;
    }

    .actions {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      align-items: stretch;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 14px 16px;
      border-radius: 12px;
      background: #15161a;
      border: 1px solid #2a2b35;
      color: #e9eaed;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: transform 0.06s ease, background 0.15s ease,
        border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .btn:hover {
      background: #1a1b20;
      border-color: #3a3b46;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    }
    .btn:focus-visible {
      outline: 2px solid #6ea8fe;
      outline-offset: 2px;
    }
    .btn:active {
      transform: translateY(1px) scale(0.995);
    }

    .index {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 999px;
      background: #0f1014;
      border: 1px solid #2a2b35;
      font-size: 12px;
      color: #cfd3da;
      flex: 0 0 auto;
    }
    .label {
      flex: 1 1 auto;
      white-space: normal;
    }
  `;

  static properties = {
    message: { type: String },
    actions: { type: Array },
    options: { type: Array },
  };

  constructor() {
    super();
    this.message = "";
    this.actions = undefined;
    this.options = undefined;
  }

  render() {
    const actions = this._resolvedActions();
    return html`
      <div class="choice" role="group" aria-label="Choose an option">
        <div class="message">${this._renderRichText(this.message)}</div>
        <div class="actions">
          ${actions.map((a, i) => this._renderButton(a, i))}
        </div>
      </div>
    `;
  }

  _resolvedActions() {
    if (Array.isArray(this.actions) && this.actions.length) return this.actions;
    if (Array.isArray(this.options) && this.options.length) {
      return this.options.map((opt, idx) => ({
        label: String(opt),
        args: { choice: String(opt), choiceIndex: idx },
      }));
    }
    return [];
  }

  _renderButton(action, idx) {
    const label = action?.label ?? String(action ?? "");
    const badge = String.fromCharCode(65 + (idx % 26)); // A, B, C…

    const onActivate = () => {
      const payload = {
        choice: label,
        choiceIndex: idx,
        ...(action?.args || {}),
      };
      this.dispatchEvent(
        new CustomEvent("choose", {
          detail: payload,
          bubbles: true,
          composed: true,
        })
      );
    };

    return html`
      <button
        class="btn"
        @click=${onActivate}
        @keydown=${(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
        aria-label=${`Choose ${label}`}
      >
        <span class="index" aria-hidden="true">${badge}</span>
        <span class="label">${label}</span>
      </button>
    `;
  }

  _renderRichText(text) {
    const s = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    const parts = s
      .trim()
      .split(/\n{2,}/)
      .filter(Boolean);
    return html`${parts.map(
      (p) =>
        html`<p>
          ${p.split(/\n/).map((line, i) => (i ? [html`<br />`, line] : line))}
        </p>`
    )}`;
  }
}

if (!customElements.get("ui-choice")) {
  customElements.define("ui-choice", UiChoice);
}

// Handy helper if you prefer function-style rendering elsewhere
export const UiChoiceView = ({ message, actions, options } = {}) =>
  html`<ui-choice
    .message=${message}
    .actions=${actions}
    .options=${options}
  ></ui-choice>`;
