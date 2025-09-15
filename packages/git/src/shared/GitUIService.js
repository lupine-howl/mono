import { getGlobalSingleton } from "@loki/utilities";
import { rpc } from "@loki/minihttp/util";
import { getGitStore } from "./GitStore.js";

/**
 * GitUIService
 * - No DB. Calls server-side tools via rpc.call(...).
 * - Updates GitStore with responses.
 * - Subscribes to rpc.onCall for tool names to keep in sync when tools run elsewhere.
 */
export class GitUIService {
  constructor() {
    this.store = getGitStore();

    // ---- External calls (from other tabs/clients) → keep store in sync ----
    rpc.onCall("gitStatus", ({ args, result }) => {
      if (result && (args?.ws || this.store.get().ws)) {
        this.store.setStatus(args?.ws, result);
      }
    });

    rpc.onCall("gitBranchList", ({ result }) => {
      if (Array.isArray(result?.items)) this.store.setBranches(result.items);
    });

    rpc.onCall("gitLog", ({ result }) => {
      if (Array.isArray(result?.items)) this.store.setLog(result.items);
    });

    rpc.onCall("gitDiff", ({ args, result }) => {
      if (typeof result?.diff === "string") {
        this.store.setDiff({
          text: result.diff,
          path: args?.path,
          cached: !!args?.cached,
          commit: args?.commit,
        });
      }
    });

    rpc.onCall("gitGenerateCommit", ({ args, result }) => {
      if (result?.subject) this.store.setCommitDraft(result.subject, result.body || "", { ws: args?.ws, source: result.source });
    });

    // For mutating ops, heuristically refresh status when called elsewhere
    for (const name of [
      "gitAdd",
      "gitRestore",
      "gitCommit",
      "gitCheckout",
      "gitPush",
      "gitPull",
    ]) {
      rpc.onCall(name, async ({ args, result }) => {
        if (result?.ok && args?.ws) {
          try {
            await this.status(args.ws);
          } catch {}
        }
      });
    }
  }

  // ---- Queries ----
  async status(ws) {
    const res = await rpc.gitStatus({ ws });
    if (res?.error) throw new Error(res.error);
    this.store.setStatus(ws, res);
    return res;
  }

  async branches(ws) {
    const res = await rpc.gitBranchList({ ws });
    if (res?.error) throw new Error(res.error);
    this.store.setBranches(res.items || []);
    return res.items || [];
  }

  async log(ws, { max = 50 } = {}) {
    const res = await rpc.gitLog({ ws, max });
    if (res?.error) throw new Error(res.error);
    this.store.setLog(res.items || []);
    return res.items || [];
  }

  async diff(ws, { path, cached = false, commit } = {}) {
    const res = await rpc.gitDiff({ ws, path, cached, commit });
    if (res?.error) throw new Error(res.error);
    this.store.setDiff({ text: res.diff || "", path, cached, commit });
    return res.diff || "";
  }

  // ---- Commit message generation ----
  async generateCommit(ws, { preferStaged = true, maxFilesInBody = 20 } = {}) {
    const r = await rpc.gitGenerateCommit({ ws, preferStaged, maxFilesInBody });
    if (r?.error) throw new Error(r.error);
    if (r?.subject) this.store.setCommitDraft(r.subject, r.body || "", { ws, source: r.source });
    return r;
  }

  // ---- Commands (mutating) ----
  async add(ws, { paths = [], all = false } = {}) {
    const r = await rpc.gitAdd({ ws, paths, all });
    if (r?.error) throw new Error(r.error);
    await this.status(ws);
    return true;
  }

  async restore(ws, { paths = [], stagedOnly = false, worktree = false } = {}) {
    const r = await rpc.gitRestore({ ws, paths, stagedOnly, worktree });
    if (r?.error) throw new Error(r.error);
    await this.status(ws);
    return true;
  }

  async commit(ws, { subject, body = "", allowEmpty = false } = {}) {
    const r = await rpc.gitCommit({ ws, subject, body, allowEmpty });
    if (r?.error) throw new Error(r.error);
    await this.status(ws);
    return r.output || "";
  }

  async checkout(ws, { name }) {
    const r = await rpc.gitCheckout({ ws, name });
    if (r?.error) throw new Error(r.error);
    await Promise.all([this.status(ws), this.branches(ws)]);
    return true;
  }

  async push(ws, { remote = "origin", branch } = {}) {
    const r = await rpc.gitPush({ ws, remote, branch });
    if (r?.error) throw new Error(r.error);
    // pushing doesn't change local status, but refresh just in case
    await this.status(ws);
    return r.output || "";
  }

  async pull(ws, { remote = "origin", branch, rebase = true } = {}) {
    const r = await rpc.gitPull({ ws, remote, branch, rebase });
    if (r?.error) throw new Error(r.error);
    await this.status(ws);
    return r.output || "";
  }
}

export function getGitUIService() {
  return getGlobalSingleton(
    Symbol.for("@loki/git:ui-service@1"),
    () => new GitUIService()
  );
}
export const gitUIService = getGitUIService();
