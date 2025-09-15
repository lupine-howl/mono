
import { getGlobalSingleton } from "@loki/utilities";

/**
 * GitStore
 * - Holds lightweight client-side state derived from tool calls (no DB).
 * - Observable with subscribe()/get().
 */
export class GitStore {
  constructor() {
    this.state = {
      ws: null,               // current workspace id/name we're viewing
      status: null,           // { branch, ahead, behind, staged, ... }
      branches: [],           // [{ name, short, current }]
      log: [],                // [{ hash, short, author, date, subject }]
      diff: null,             // { path?, cached?, commit?, text }
      selectedCommit: null,   // hash
      commitDraft: null,      // { subject, body, source, generatedAt }
      lastError: null,
      lastRunAt: 0,
    };
    this._subs = new Set();

    // batching
    this._batchDepth = 0;
    this._pendingMeta = null;
  }

  // ---- observable ----
  get() { return this.state; }
  subscribe(fn) {
    this._subs.add(fn);
    queueMicrotask(() => fn(this.state, { op: "prime" }));
    return () => this._subs.delete(fn);
  }
  _notify(meta = {}) {
    if (this._batchDepth > 0) {
      this._pendingMeta = { ...(this._pendingMeta || {}), ...meta };
      return;
    }
    for (const fn of this._subs) fn(this.state, meta);
  }
  batch(fn) {
    this._batchDepth++;
    try { fn(); }
    finally {
      if (--this._batchDepth === 0 && this._pendingMeta) {
        const m = this._pendingMeta; this._pendingMeta = null;
        queueMicrotask(() => this._notify(m));
      }
    }
  }
  setError(e, meta = {}) {
    const msg = String(e?.message || e);
    this.state = { ...this.state, lastError: msg };
    this._notify({ op: "error", error: msg, ...meta });
  }

  // ---- selectors ----
  get currentBranch() { return this.state.status?.branch ?? ""; }
  get ahead() { return this.state.status?.ahead ?? 0; }
  get behind() { return this.state.status?.behind ?? 0; }
  get staged() { return this.state.status?.staged ?? []; }
  get unstaged() { return this.state.status?.unstaged ?? []; }
  get untracked() { return this.state.status?.untracked ?? []; }
  get renamed() { return this.state.status?.renamed ?? []; }
  get deleted() { return this.state.status?.deleted ?? []; }

  // ---- mutations ----
  setWorkspace(ws) {
    if (ws === this.state.ws) return;
    this.state = { ...this.state, ws };
    this._notify({ op: "ws", ws });
  }

  setStatus(ws, status) {
    this.state = {
      ...this.state,
      ws: ws ?? this.state.ws,
      status: status ?? null,
      lastRunAt: Date.now(),
    };
    this._notify({ op: "status", ws: this.state.ws });
  }

  setBranches(items) {
    this.state = { ...this.state, branches: Array.isArray(items) ? items : [] };
    this._notify({ op: "branches" });
  }

  setLog(items) {
    this.state = { ...this.state, log: Array.isArray(items) ? items : [] };
    this._notify({ op: "log" });
  }

  setDiff({ text, path, cached, commit }) {
    this.state = { ...this.state, diff: { text: String(text ?? ""), path, cached, commit } };
    this._notify({ op: "diff", path, cached, commit });
  }

  selectCommit(hash) {
    this.state = { ...this.state, selectedCommit: hash ?? null };
    this._notify({ op: "select:commit", hash });
  }

  setCommitDraft(subject, body = "", meta = {}) {
    const draft = { subject: String(subject || ""), body: String(body || ""), source: meta.source || null, generatedAt: Date.now() };
    this.state = { ...this.state, commitDraft: draft };
    this._notify({ op: "commit:draft", ...meta });
  }
}

export function getGitStore() {
  return getGlobalSingleton(Symbol.for("@loki/git:store@1"), () => new GitStore());
}
export const gitStore = getGitStore();
