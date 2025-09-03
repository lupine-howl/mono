// @loki/terminal/ui/package-viewer.js
import { LitElement, html, css } from "lit";
import { fsRead } from "@loki/file-browser/util";
import { termShExec } from "@loki/terminal/util";

export class PackageViewer extends LitElement {
  static styles = css`
    :host { display:block; height:100%; min-height:0; }
    .wrap { display:flex; flex-direction:column; gap:12px; height:100%; }
    .bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap;
           border-bottom:1px solid #1f1f22; padding-bottom:8px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .pill { border:1px solid #2a2a30; border-radius:999px; padding:2px 8px; font-size:12px; opacity:.9; }
    .hint { font-size:12px; opacity:.7; }
    .btn, .input, .sel { border:1px solid #2a2a30; background:#151519; color:inherit; font:inherit; border-radius:8px; }
    .btn { padding:6px 10px; cursor:pointer; }
    .input { padding:6px 10px; min-width:200px; }
    .sel { padding:6px 10px; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    .card { border:1px solid #1f1f22; border-radius:10px; background:#0f0f12; padding:12px; min-height:0; }
    .row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .k { font-weight:600; }
    .muted { opacity:.8; }
    .scripts { display:flex; flex-direction:column; gap:10px; }
    .term { flex:1 1 auto; min-height:140px; overflow:auto; white-space:pre-wrap; }
    .stderr { color:#ff9aa2; }
  `;

  static properties = {
    ws:   { type: String },       // workspace id
    path: { type: String },       // path to package.json (relative to ws)

    // internal
    _pkg:      { state: true },
    _pm:       { state: true },   // npm|pnpm|yarn|bun
    _pkgDir:   { state: true },
    _error:    { state: true },
    _busy:     { state: true },
    _args:     { state: true },   // per-script extra args
    _history:  { state: true },   // [{cmd, ok, code, stdout, stderr, ms, timeout}]
  };

  constructor() {
    super();
    this.ws = "";
    this.path = "";
    this._pkg = null;
    this._pm = "npm";
    this._pkgDir = ".";
    this._error = null;
    this._busy = false;
    this._args = {};
    this._history = [];
  }

  firstUpdated() { this._load(); }
  updated(changed) {
    if (changed.has("ws") || changed.has("path")) this._load();
  }

  render() {
    const title = this.ws && this.path ? `${this.ws} : ${this.path}` :
                  this.ws ? `${this.ws} : (no package.json)` : "(no workspace)";

    return html`
      <div class="wrap">
        <div class="bar">
          <span class="pill">pkg</span>
          <span class="mono" title=${title}>${title}</span>
          <span class="pill">pm</span>
          <select class="sel mono" .value=${this._pm} @change=${e=>this._pm=e.target.value}>
            <option value="npm">npm</option>
            <option value="pnpm">pnpm</option>
            <option value="yarn">yarn</option>
            <option value="bun">bun</option>
          </select>
          <button class="btn" @click=${this._reload}>Reload</button>
          ${this._busy ? html`<span class="hint">Running…</span>` : ""}
        </div>

        ${this._error ? html`<div class="card hint">Error: ${this._error}</div>` : ""}

        ${!this._pkg ? html`
          <div class="card hint">Set <code>ws</code> and <code>path</code> (to package.json) to load.</div>
        ` : html`
          <div class="grid">
            <div class="card">
              <div class="row"><div class="k">name</div><div class="mono">${this._pkg.name ?? "-"}</div></div>
              <div class="row"><div class="k">version</div><div class="mono">${this._pkg.version ?? "-"}</div></div>
              ${this._pkg.description ? html`
                <div class="row"><div class="k">description</div><div class="mono muted">${this._pkg.description}</div></div>` : ""}
              ${this._pkg.private !== undefined ? html`
                <div class="row"><div class="k">private</div><div class="mono">${String(this._pkg.private)}</div></div>` : ""}
              ${this._pkg.packageManager ? html`
                <div class="row"><div class="k">packageManager</div><div class="mono">${this._pkg.packageManager}</div></div>` : ""}
              ${this._quickButtons().length ? html`
                <div class="row" style="margin-top:8px; gap:6px;">
                  ${this._quickButtons().map(b => html`
                    <button class="btn" @click=${() => this._runCmd(b.cmd, b.label)}>${b.label}</button>
                  `)}
                </div>` : ""}
            </div>

            <div class="card">
              <div class="row" style="justify-content:space-between;">
                <div class="k">scripts</div>
                ${this._pkg?.scripts ? html`
                  <button class="btn" @click=${this._runAll} ?disabled=${this._busy}>Run all…</button>
                ` : ""}
              </div>

              <div class="scripts">
                ${this._pkg?.scripts ? Object.entries(this._pkg.scripts).map(([name, val]) => html`
                  <div class="row">
                    <span class="pill mono">${name}</span>
                    <span class="mono muted" title=${val}>${val}</span>
                  </div>
                  <div class="row">
                    <input class="input mono" placeholder="extra args (optional)"
                           .value=${this._args[name] || ""}
                           @input=${(e)=>this._args = { ...this._args, [name]: e.target.value }} />
                    <button class="btn" @click=${() => this._runScript(name)} ?disabled=${this._busy}>Run</button>
                  </div>
                `) : html`<div class="hint">No scripts.</div>`}
              </div>
            </div>
          </div>

          <div class="card term mono" id="term">
            ${this._history.length === 0 ? html`
              <span class="hint">Output will appear here.</span>
            ` : this._history.map(h => html`
              <div>$ ${h.cmd}</div>
              ${h.stdout ? html`<div>${h.stdout}</div>` : ""}
              ${h.stderr ? html`<div class="stderr">${h.stderr}</div>` : ""}
              <div class="hint">[exit ${h.code}${h.timeout ? " (timeout)" : ""} · ${h.ms}ms]</div>
              <div>&nbsp;</div>
            `)}
          </div>
        `}
      </div>
    `;
  }

  // ------- data -------
  async _load() {
    this._error = null;
    this._pkg = null;
    if (!this.ws || !this.path) return;

    try {
      const res = await fsRead({ ws: this.ws, path: this.path });
      const text = res?.content ?? "";
      const json = JSON.parse(text);

      this._pkg = json;
      this._pm = this._detectPm(json) || this._pm;
      this._pkgDir = this._dirname(this.path);
    } catch (e) {
      this._error = e?.message || String(e);
    }
  }
  _reload = () => this._load();

  _detectPm(pkg) {
    const pm = String(pkg?.packageManager || "").toLowerCase();
    if (pm.startsWith("pnpm")) return "pnpm";
    if (pm.startsWith("yarn")) return "yarn";
    if (pm.startsWith("bun")) return "bun";
    if (pm.startsWith("npm")) return "npm";
    return "npm";
  }
  _dirname(p) {
    if (!p) return ".";
    const idx = p.lastIndexOf("/");
    return idx >= 0 ? (idx === 0 ? "/" : p.slice(0, idx)) : ".";
  }

  // ------- commands -------
  _commandForScript(name, extraArgs = "") {
    const args = extraArgs?.trim() ? " " + extraArgs.trim() : "";
    switch (this._pm) {
      case "pnpm": return `pnpm run ${name}${args}`;
      case "yarn": return `yarn ${name}${args}`; // yarn omits "run"
      case "bun":  return `bun run ${name}${args}`;
      default:     return `npm run ${name}${args}`;
    }
  }
  _quickButtons() {
    const s = this._pkg?.scripts || {};
    const buttons = [];
    if (s.install) buttons.push({ label: "Install", cmd: this._commandForScript("install") });
    if (s.build)   buttons.push({ label: "Build",   cmd: this._commandForScript("build") });
    if (s.test)    buttons.push({ label: "Test",    cmd: this._commandForScript("test") });
    if (s.start)   buttons.push({ label: "Start",   cmd: this._commandForScript("start") });
    return buttons;
    }

  async _runScript(name) {
    if (!this.ws || !this._pkgDir) return;
    const extra = this._args?.[name] || "";
    const cmd = this._commandForScript(name, extra);
    await this._runCmd(cmd);
  }
  async _runAll() {
    if (!this._pkg?.scripts) return;
    for (const name of Object.keys(this._pkg.scripts)) {
      await this._runScript(name);
      await new Promise(r => setTimeout(r, 10));
    }
  }
  async _runCmd(cmd, label = "") {
    if (!this.ws || !this._pkgDir) return;
    this._busy = true;
    try {
      const res = await termShExec({
        ws: this.ws,
        command: cmd,
        cwd: this._pkgDir,
        timeoutMs: 10 * 60 * 1000,
      });
      this._append({
        cmd: label ? `${label}: ${cmd}` : cmd,
        ok: !!res?.ok,
        code: res?.exitCode ?? -1,
        stdout: res?.stdout || "",
        stderr: res?.stderr || "",
        ms: res?.durationMs ?? 0,
        timeout: !!res?.timedOut,
      });
    } catch (e) {
      this._append({ cmd, ok:false, code:null, stdout:"", stderr:String(e?.message || e), ms:0 });
    } finally {
      this._busy = false;
    }
  }
  _append(entry) {
    this._history = [...this._history, entry];
    this.updateComplete.then(() => {
      const el = this.renderRoot?.getElementById?.("term");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}

if (!customElements.get("package-viewer")) {
  customElements.define("package-viewer", PackageViewer);
}
