// src/ui/tool-directory.js
import { LitElement, html, css } from "lit";
import { ToolsController } from "../shared/ToolsController.js";

function typeOfSchema(def) {
  if (!def) return "any";
  if (def.type === "array") {
    const t = typeOfSchema(def.items || {});
    return `array<${t}>`;
  }
  if (def.type) return String(def.type);
  if (def.enum) return `enum(${def.enum.map(String).join("|")})`;
  return "any";
}

function listParamsShort(schema) {
  if (!schema || schema.type !== "object") return [];
  const props = schema.properties || {};
  const req = new Set(schema.required || []);
  return Object.entries(props).map(([name, def]) => ({
    name,
    type: typeOfSchema(def || {}),
    required: req.has(name),
  }));
}

function toMarkdown(tools) {
  const lines = [];
  lines.push("| Tool | Params | Description |");
  lines.push("|---|---|---|");
  for (const t of tools) {
    const params = listParamsShort(t.parameters)
      .map((p) => `${p.name}:${p.type}${p.required ? "*" : ""}`)
      .join(", ");
    const desc = (t.description || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
    lines.push(`| ${t.name} | ${params} | ${desc} |`);
  }
  return lines.join("\n");
}

export class ToolDirectory extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: #e7e7ea;
      font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .wrap {
      padding: 12px;
      background: #0b0b0c;
      border: 1px solid #1f1f22;
      border-radius: 12px;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      border-bottom: 1px solid #1f1f22;
      padding: 6px 8px;
      vertical-align: top;
    }
    th { color: #9aa3b2; font-weight: 600; }
    .muted { color: #9aa3b2; }
    .controls { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
    button {
      background: #0f0f12;
      border: 1px solid #2a2a30;
      color: #e7e7ea;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: #131317; }
    pre {
      background: #131317;
      border: 1px solid #1f1f22;
      border-radius: 8px;
      padding: 8px;
      overflow: auto;
      white-space: pre;
    }
  `;

  static properties = {
    _tools: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _markdown: { state: true },
  };

  constructor() {
    super();
    this._tools = [];
    this._loading = true;
    this._error = null;
    this._markdown = "";

    this.controller = new ToolsController();
    this._onChange = (e) => {
      const d = e.detail || {};
      if (Array.isArray(d.tools)) {
        this._tools = d.tools;
        this._markdown = toMarkdown(this._tools);
      }
      if (d.type === "tools:loading") this._loading = true;
      if (d.type === "tools:loaded") this._loading = false;
      if (d.error !== undefined) this._error = d.error;
      this.requestUpdate();
    };
    this.controller.addEventListener("tools:change", this._onChange);

    const init = () => {
      this._tools = this.controller.tools || [];
      this._markdown = toMarkdown(this._tools);
      this._loading = false;
      this.requestUpdate();
    };
    this.controller.ready?.().then(init).catch((e) => {
      this._error = e?.message || String(e);
      this._loading = false;
      this.requestUpdate();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller?.removeEventListener("tools:change", this._onChange);
  }

  async _copyMarkdown() {
    try {
      await navigator.clipboard.writeText(this._markdown);
    } catch {}
  }

  render() {
    if (this._loading) return html`<div class="wrap">Loading…</div>`;
    if (this._error) return html`<div class="wrap">Error: ${this._error}</div>`;
    const md = this._markdown;
    return html`
      <div class="wrap">
        <div class="controls">
          <span class="muted">${this._tools.length} tools</span>
          <button @click=${() => this.controller.refreshTools()}>Refresh</button>
          <button @click=${() => this._copyMarkdown()}>Copy markdown</button>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 220px;">Tool</th>
              <th style="width: 35%;">Params</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${this._tools.map((t) => {
              const params = listParamsShort(t.parameters)
                .map((p) => `${p.name}:${p.type}${p.required ? "*" : ""}`)
                .join(", ");
              return html`
                <tr>
                  <td><code>${t.name}</code></td>
                  <td class="muted">${params}</td>
                  <td>${t.description || ""}</td>
                </tr>`;
            })}
          </tbody>
        </table>

        <details style="margin-top:12px;">
          <summary>Markdown</summary>
          <pre>${md}</pre>
        </details>
      </div>
    `;
  }
}

if (!customElements.get("tool-directory")) {
  customElements.define("tool-directory", ToolDirectory);
}
