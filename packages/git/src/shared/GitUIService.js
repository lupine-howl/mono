import { getGlobalSingleton } from "@loki/utilities";
import { toolRegistry as rpc } from "@loki/minihttp/util";
import { getGitStore } from "./GitStore.js";
import { aiChatService } from "@loki/ai-chat/util";

/**
 * GitUIService
 * - No DB. Calls server-side tools via rpc.call(...).
 * - Updates GitStore with responses.
 * - Subscribes to rpc.onCall for tool names to keep in sync when tools run elsewhere.
 */
export class GitUIService {
  constructor() {
    this.store = getGitStore();
  }

  // ---- Queries ----
  async status(ws) {
    const res = await rpc.$call("gitStatus", { ws });
    if (res?.error) throw new Error(res.error);
    this.store.setStatus(ws, res);
    return res;
  }

  async branches(ws) {
    const res = await rpc.$call("gitBranchList", { ws });
    if (res?.error) throw new Error(res.error);
    this.store.setBranches(res.items || []);
    return res.items || [];
  }

  async log(ws, { max = 50 } = {}) {
    const res = await rpc.$call("gitLog", { ws, max });
    if (res?.error) throw new Error(res.error);
    this.store.setLog(res.items || []);
    return res.items || [];
  }

  async diff(ws, { path, cached = false, commit } = {}) {
    const res = await rpc.$call("gitDiff", { ws, path, cached, commit });
    if (res?.error) throw new Error(res.error);
    this.store.setDiff({ text: res.diff || "", path, cached, commit });
    return res.diff || "";
  }

  /**
   * Build a compact, AI-friendly summary of current changes.
   * Includes branch/ahead/behind and a categorized list of changed files.
   * You can extend this to fetch a few diffs if you later want deeper context.
   */
  async createCommitContext(
    ws,
    {
      preferStaged = true,
      maxList = 40, // cap the number of filenames shown across categories
      includeUntracked = true,
    } = {}
  ) {
    const st = await this.status(ws); // ensures store sync too
    const branch = st?.branch || "";
    const ahead = Number(st?.ahead || 0);
    const behind = Number(st?.behind || 0);

    // Determine which set to emphasize
    const staged = {
      added: Array.isArray(st?.staged) ? st.staged.filter(Boolean) : [],
      // We only have a flat "staged" array from your earlier status tool;
      // if you later split added/modified/deleted/renamed by category, wire that here.
    };

    // Combine tracked changes: staged + unstaged, keeping uniqueness
    const unstaged = Array.isArray(st?.unstaged)
      ? st.unstaged.filter(Boolean)
      : [];
    const stagedFlat = staged.added;
    const combinedTracked = Array.from(new Set([...unstaged, ...stagedFlat]));

    const untracked =
      includeUntracked && Array.isArray(st?.untracked)
        ? st.untracked.filter(Boolean)
        : [];

    // order: modified-ish first, then added, then others — heuristic only
    const seen = new Set();
    const files = [];
    function pushList(list) {
      for (const p of list) {
        if (seen.size >= maxList) break;
        if (!p) continue;
        if (seen.has(p)) continue;
        seen.add(p);
        files.push(p);
      }
    }
    pushList(combinedTracked);
    pushList(untracked);

    // small helper to tag by type-ish
    const cat = { code: 0, docs: 0, tests: 0, styles: 0, config: 0, other: 0 };
    const configNames = new Set([
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      ".eslintrc",
      ".eslintrc.json",
      ".prettierrc",
      ".prettierrc.json",
      "tsconfig.json",
      "vite.config.ts",
      "vite.config.js",
      "esbuild.config.js",
      "esbuild.mjs",
      "rollup.config.js",
    ]);
    const codeExt = new Set([
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "go",
      "rb",
      "java",
      "cs",
      "cpp",
      "c",
      "rs",
      "php",
    ]);
    function classify(path) {
      const name = path.split("/").pop() || path;
      const ext = (name.split(".").pop() || "").toLowerCase();
      const lower = path.toLowerCase();
      if (
        ["md", "mdx", "markdown", "rst", "txt"].includes(ext) ||
        lower.startsWith("docs/")
      )
        return "docs";
      if (["css", "scss", "sass", "less", "styl"].includes(ext))
        return "styles";
      if (/(^|\/)__tests__(\/|$)|[.](test|spec)[.]/i.test(path)) return "tests";
      if (configNames.has(name)) return "config";
      if (codeExt.has(ext)) return "code";
      return "other";
    }
    for (const p of files) cat[classify(p)]++;

    // context markdown
    const header = `Repo status:\n- branch: ${
      branch || "(unknown)"
    }  (+${ahead}/-${behind})\n- prefer: ${
      preferStaged ? "staged" : "unstaged"
    }\n- totals by type: ${
      Object.entries(cat)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(", ") || "(none)"
    }\n`;

    const listLines =
      files.map((p) => `  - ${p}`).join("\n") || "  (no visible changes)";
    const body = `Changed files (capped ${maxList}):\n${listLines}\n`;

    return `${header}\n${body}`.trim();
  }

  // ---- Commit message generation (AI-assisted) ----
  async generateCommit(
    ws,
    { preferStaged = true, maxFilesInBody = 20, contextMaxList = 40 } = {}
  ) {
    // Build context for the model so it can propose subject/body for gitCommit
    const contextStr = await this.createCommitContext(ws, {
      preferStaged,
      maxList: contextMaxList,
    });

    // Ask the AI to propose args for the "gitCommit" tool, but do NOT execute.
    const outcome = await rpc.$call("aiRequest", {
      prompt:
        "Generate a concise, descriptive git commit message (subject <= 50 chars, optional multi-line body). Prefer imperative mood. If many files changed, summarize themes. Use bullets only if helpful.",
      toolName: "gitCommit",
      system: contextStr,
      force: true,
    });

    console.log("AI outcome for gitCommit:", outcome);
    const data = outcome?.data || {};

    // outcome shape depends on your submit(); handle the common cases:
    if (data?.tool_name === "gitCommit" && data?.tool_args) {
      const subject = String(data.tool_args.subject || "").trim();
      const body = String(data.tool_args.body || "").trim();
      if (subject) {
        this.store.setCommitDraft(subject, body, {
          ws,
          source: "ai:tool-plan",
        });
        return { ok: true, subject, body, source: "ai:tool-plan" };
      }
    }

    // If the backend already executed (shouldn't here), we still just stash draft if present
    if (outcome?.executedResult?.subject) {
      const subject = String(outcome.executedResult.subject).trim();
      const body = String(outcome.executedResult.body || "").trim();
      if (subject) {
        this.store.setCommitDraft(subject, body, {
          ws,
          source: "ai:executed-result",
        });
        return { ok: true, subject, body, source: "ai:executed-result" };
      }
    }
    return { ok: false, error: "No commit draft generated" };
  }

  // ---- Commands (mutating) ----
  async add(ws, { paths = [], all = false } = {}) {
    const r = await rpc.$call("gitAdd", { ws, paths, all });
    if (r?.error) throw new Error(r.error);
    await this.status(ws);
    return true;
  }

  async restore(ws, { paths = [], stagedOnly = false, worktree = false } = {}) {
    const r = await rpc.$call("gitRestore", {
      ws,
      paths,
      stagedOnly,
      worktree,
    });
    if (r?.error) throw new Error(r.error);
    await this.status(ws);
    return true;
  }

  async commit(ws, { subject, body = "", allowEmpty = false } = {}) {
    const r = await rpc.$call("gitCommit", { ws, subject, body, allowEmpty });
    if (r?.error) throw new Error(r.error);
    // Clear draft on successful commit so UI inputs reset reactively
    try {
      this.store.setCommitDraft("", "", { ws, source: "commit:success" });
    } catch {}
    await this.status(ws);
    return r.output || "";
  }

  async checkout(ws, { name }) {
    const r = await rpc.$call("gitCheckout", { ws, name });
    if (r?.error) throw new Error(r.error);
    await Promise.all([this.status(ws), this.branches(ws)]);
    return true;
  }

  async push(ws, { remote = "origin", branch } = {}) {
    const r = await rpc.$call("gitPush", { ws, remote, branch });
    if (r?.error) throw new Error(r.error);
    // pushing doesn't change local status, but refresh just in case
    await this.status(ws);
    return r.output || "";
  }

  async pull(ws, { remote = "origin", branch, rebase = true } = {}) {
    const r = await rpc.$call("gitPull", { ws, remote, branch, rebase });
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
