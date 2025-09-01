// src/ui/chat-cards/chat-tool-result.js
import { LitElement, html, css } from "lit";
import {
  parseMaybeJSON,
  previewForResult,
  fmtCell,
  trunc,
} from "./render-utils.js";

const isUrl = (s) => typeof s === "string" && /^https?:\/\/\S+$/i.test(s);
const linkTpl = (href, text = href) =>
  html`<a href=${href} target="_blank" rel="noopener noreferrer">${text}</a>`;

export class ChatToolResult extends LitElement {
  static styles = css`
    .card {
      border: 1px solid #1f1f22;
      background: #0f0f12;
      border-radius: 12px;
      padding: 10px 12px;
      width: fit-content;
      max-width: 600px;
      display: grid;
      gap: 6px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spacer {
      flex: 1;
    }
    .badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #2a2a30;
      background: #17171b;
    }
    .badge.ok {
      border-color: #23462e;
      color: #b9f6c3;
      background: #122017;
    }
    .badge.err {
      border-color: #6a2a2a;
      color: #ffb3b3;
      background: #261616;
    }
    .tool-name code {
      background: #1a1a1f;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .muted {
      opacity: 0.75;
      font-size: 12px;
    }
    .tool-table {
      overflow: auto;
    }
    table {
      border-collapse: collapse;
      font-size: 12px;
    }
    th,
    td {
      border: 1px solid #2a2a30;
      padding: 4px 6px;
      white-space: nowrap;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    dl.kv {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      font-size: 13px;
    }
    dl.kv dt {
      opacity: 0.75;
    }
    dl.kv dd {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    pre {
      white-space: pre-wrap;
    }
  `;
  static properties = { message: { attribute: false } };

  render() {
    const m = this.message ?? {};
    const name = m.name || "tool";
    const res =
      typeof m.result === "string"
        ? parseMaybeJSON(m.result) ?? m.result
        : m.result;
    const ok = m.ok !== false;
    const pv = previewForResult(res);

    const head = html`
      <div class="row">
        <div>
          Result from <span class="tool-name"><code>${name}</code></span>
        </div>
        <div class="spacer"></div>
        <span class="badge ${ok ? "ok" : "err"}">${ok ? "ok" : "error"}</span>
      </div>
      ${pv.subtitle ? html`<div class="muted">${pv.subtitle}</div>` : ""}
    `;

    let body;
    if (pv.view === "table") {
      body = html`
        <div class="tool-table">
          <table>
            <thead>
              <tr>
                ${pv.cols.map((c) => html`<th>${c}</th>`)}
              </tr>
            </thead>
            <tbody>
              ${pv.rows.map(
                (r) => html`<tr>
                  ${pv.cols.map((c) => {
                    const v = r[c];
                    const title =
                      typeof v === "object"
                        ? JSON.stringify(v)
                        : String(v ?? "");
                    const cell =
                      typeof v === "string" && isUrl(v)
                        ? linkTpl(v, fmtCell(v, 50))
                        : fmtCell(v, 50);
                    return html`<td title=${title}>${cell}</td>`;
                  })}
                </tr>`
              )}
            </tbody>
          </table>
          ${pv.more ? html`<div class="muted">+${pv.more} more rows</div>` : ""}
        </div>
      `;
    } else if (pv.view === "list") {
      // Prefer pv.links (if provided by previewer) to get full hrefs for truncated items
      const linksByIndex = new Map(
        (pv.links || []).map((x) => [x.index, x.href])
      );
      body = html`
        <ul class="muted">
          ${pv.items.map((display, i) => {
            const href =
              linksByIndex.get(i) ||
              (isUrl(display) && !display.endsWith("…") ? display : null);
            return html`<li>${href ? linkTpl(href, display) : display}</li>`;
          })}
        </ul>
        ${pv.more ? html`<div class="muted">+${pv.more} more</div>` : ""}
      `;
    } else if (pv.view === "kv") {
      body = html`
        <dl class="kv">
          ${pv.entries.map(([k, v]) => {
            const text = trunc(v, 80);
            const val =
              typeof v === "string" && isUrl(v) ? linkTpl(v, text) : text;
            return html`<dt>${k}</dt>
              <dd title=${String(v)}>${val}</dd>`;
          })}
        </dl>
        ${pv.more ? html`<div class="muted">+${pv.more} more</div>` : ""}
      `;
    } else if (pv.view === "text") {
      // We still have original `res` (string) even though pv.text is truncated
      if (typeof res === "string" && isUrl(res)) {
        const text = trunc(res, 1000);
        body = html`${linkTpl(res, text)}`;
      } else {
        body = html`<pre>${pv.text}</pre>`;
      }
    } else {
      body = html`<details open>
        <summary>Data</summary>
        <pre>
${typeof res === "string" ? res : JSON.stringify(res, null, 2)}</pre
        >
      </details>`;
    }

    return html`<div class="card" data-id=${m.id ?? ""}>${head}${body}</div>`;
  }
}
if (!customElements.get("chat-tool-result")) {
  customElements.define("chat-tool-result", ChatToolResult);
}
