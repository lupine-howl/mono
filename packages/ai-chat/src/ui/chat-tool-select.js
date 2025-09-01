// src/ui/chat-tool-select.js
import { LitElement, html, css } from "lit";
import "@loki/layout/ui/smart-select.js";
import "@loki/minihttp/ui/tool-select.js";
import { AIChatController } from "../shared/AIChatController.js";

export class ChatToolSelect extends LitElement {
  static styles = css`
    :host {
      display: contents;
    } /* let parent control layout */
    .row {
      display: inline-block;
    }
  `;

  static properties = {
    // Optional: if you have a ToolsController you want to share, pass it in.
    // If omitted, <tool-select> will use its own self-instantiated controller.
    toolController: { attribute: false },

    // Internal mirror of chat state
    _mode: { state: true }, // "off" | "force" | "run" | "auto"
  };

  constructor() {
    super();
    // Self-instantiate chat controller (singleton-backed)
    this.controller = new AIChatController();

    // Mirror only what we need
    const s = this.controller.get?.() ?? {};
    this._mode = s.mode ?? "off";

    this.controller.subscribe((st, patch) => {
      if ("mode" in patch) {
        this._mode = st.mode ?? "off";
        this.requestUpdate();
      }
    });
  }

  render() {
    const mode = this._mode ?? "off";

    return html`
      <div class="row">
        <smart-select
          mode="button"
          .value=${mode}
          @change=${(e) => this.controller.setMode(e.target.value)}
        >
          <option value="off">off</option>
          <option value="force">force</option>
          <option value="run">run</option>
          <option value="auto">auto</option>
        </smart-select>

        ${mode !== "off"
          ? html`
              <tool-select
                @tool-change=${(e) =>
                  this.controller.setToolName(e.detail.value)}
              ></tool-select>
            `
          : null}
      </div>
    `;
  }
}

if (!customElements.get("chat-tool-select")) {
  customElements.define("chat-tool-select", ChatToolSelect);
}
