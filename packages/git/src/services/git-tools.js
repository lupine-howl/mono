import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createFsService } from "@loki/file-browser";

const execFileAsync = promisify(execFile);

// Helper: resolve absolute workspace path from ws id/name using fs service
async function resolveWorkspacePath(svc, ws) {
  const j = await svc.fsWorkspaces();
  const list = Array.isArray(j?.workspaces) ? j.workspaces : [];
  const found =
    list.find((w) => w.id === ws) || list.find((w) => w.name === ws);
  if (!found) throw new Error(`Unknown workspace: ${ws}`);
  return found.path;
}

async function runGit(cwd, args, { timeout = 15000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    const msg = e?.stderr || e?.stdout || e?.message || String(e);
    return { ok: false, error: msg, code: e?.code ?? 1 };
  }
}

async function ensureRepo(cwd) {
  const r = await runGit(cwd, ["rev-parse", "--git-dir"]);
  if (!r.ok) throw new Error("Not a git repository");
  return true;
}

async function currentBranch(cwd) {
  const r = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!r.ok) throw new Error(r.error || "Failed to get current branch");
  return r.stdout.trim();
}

function parsePorcelain(txt) {
  // Very simple parser for `git status --porcelain`
  const lines = (txt || "").split(/\r?\n/).filter(Boolean);
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const renamed = [];
  const deleted = [];
  for (const ln of lines) {
    const x = ln.slice(0, 1);
    const y = ln.slice(1, 2);
    // Support rename format: R  old -> new
    // General: XY <path>
    const rest = ln.slice(3).trim();
    const name = rest.includes(" -> ") ? rest.split(" -> ").pop() : rest;
    if (x === "?" || y === "?") {
      untracked.push(name);
    } else {
      if (x !== " " && x !== "?") staged.push(name);
      if (y !== " ") {
        if (y === "R") renamed.push(name);
        else if (y === "D") deleted.push(name);
        else unstaged.push(name);
      }
    }
  }
  return { staged, unstaged, untracked, renamed, deleted };
}

export function registerGitTools(tools, { root } = {}) {
  // Keep same root heuristic as fs tools: two levels up from the running app
  const effectiveRoot = root || path.resolve(process.cwd(), "../../");
  const fsSvc = createFsService({ root: effectiveRoot });

  async function getCwd(ws) {
    const p = await resolveWorkspacePath(fsSvc, ws);
    await ensureRepo(p);
    return p;
  }

  tools.define({
    name: "gitStatus",
    description: "Get git status (staged, unstaged, untracked) and branch info",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: { ws: { type: "string" } },
      additionalProperties: false,
    },
    safe: true,
    handler: async ({ ws }) => {
      const cwd = await getCwd(ws);
      const [branchRes, porcelainRes, aheadBehindRes] = await Promise.all([
        runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
        runGit(cwd, ["status", "--porcelain"]),
        runGit(cwd, [
          "rev-list",
          "--left-right",
          "--count",
          "@{upstream}...HEAD",
        ]).catch(() => ({ ok: true, stdout: "0\t0" })),
      ]);
      const branch = branchRes.ok ? branchRes.stdout.trim() : "";
      const { staged, unstaged, untracked, renamed, deleted } = parsePorcelain(
        porcelainRes.ok ? porcelainRes.stdout : ""
      );
      const [behindStr, aheadStr] = (aheadBehindRes.stdout || "0\t0")
        .trim()
        .split(/\s+/);
      const ahead = Number(aheadStr || 0);
      const behind = Number(behindStr || 0);
      return {
        ws,
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        renamed,
        deleted,
      };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitAdd",
    description: "Stage files (paths[]) or everything (all=true)",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        all: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    handler: async ({ ws, paths = [], all = false }) => {
      const cwd = await getCwd(ws);
      const args =
        all || paths.length === 0 ? ["add", "-A"] : ["add", ...paths];
      const r = await runGit(cwd, args);
      if (!r.ok) return { error: r.error };
      return { ok: true };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitRestore",
    description:
      "Restore files from HEAD. stagedOnly=true to unstage; worktree=true to discard local changes.",
    parameters: {
      type: "object",
      required: ["ws", "paths"],
      properties: {
        ws: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        stagedOnly: { type: "boolean", default: false },
        worktree: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    handler: async ({
      ws,
      paths = [],
      stagedOnly = false,
      worktree = false,
    }) => {
      const cwd = await getCwd(ws);
      if (paths.length === 0) return { ok: true };
      let args;
      if (stagedOnly) args = ["restore", "--staged", ...paths];
      else if (worktree) args = ["restore", "--worktree", ...paths];
      else args = ["restore", "--source=HEAD", ...paths];
      const r = await runGit(cwd, args);
      return r.ok ? { ok: true } : { error: r.error };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitCommit",
    description: "Create a commit from staged changes.",
    parameters: {
      type: "object",
      required: ["ws", "subject"],
      properties: {
        ws: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        allowEmpty: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    handler: async ({ ws, subject, body = "", allowEmpty = false }) => {
      const cwd = await getCwd(ws);
      const args = ["commit", "-m", subject, ...(body ? ["-m", body] : [])];
      if (allowEmpty) args.push("--allow-empty");
      const r = await runGit(cwd, args);
      return r.ok ? { ok: true, output: r.stdout } : { error: r.error };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitLog",
    description: "List recent commits",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        max: { type: "integer", default: 50 },
      },
      additionalProperties: false,
    },
    safe: true,
    handler: async ({ ws, max = 50 }) => {
      const cwd = await getCwd(ws);
      const fmt = "%H\t%h\t%an\t%ad\t%s";
      const r = await runGit(cwd, [
        "log",
        `-n`,
        String(Math.max(1, Math.min(500, max))),
        `--pretty=format:${fmt}`,
        "--date=iso-strict",
      ]);
      if (!r.ok) return { error: r.error };
      const items = r.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((ln) => {
          const [hash, short, author, date, ...rest] = ln.split("\t");
          const subject = rest.join("\t");
          return { hash, short, author, date, subject };
        });
      return { ws, items };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitDiff",
    description:
      "Get a unified diff. If cached=true, diff staged. If path provided, limit to that file.",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        path: { type: "string" },
        cached: { type: "boolean", default: false },
        commit: { type: "string" },
      },
      additionalProperties: false,
    },
    safe: true,
    handler: async ({ ws, path: p, cached = false, commit }) => {
      const cwd = await getCwd(ws);
      const args = commit
        ? ["show", commit, "--patch", "--no-color", ...(p ? ["--", p] : [])]
        : [
            "diff",
            ...(cached ? ["--cached"] : []),
            "--no-color",
            ...(p ? ["--", p] : []),
          ];
      const r = await runGit(cwd, args, { timeout: 20000 });
      return r.ok ? { ws, diff: r.stdout } : { error: r.error };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitBranchList",
    description: "List local branches",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: { ws: { type: "string" } },
      additionalProperties: false,
    },
    safe: true,
    handler: async ({ ws }) => {
      const cwd = await getCwd(ws);
      const r = await runGit(cwd, [
        "branch",
        "--format=%(refname:short)\t%(objectname:short)\t%(HEAD)",
      ]);
      if (!r.ok) return { error: r.error };
      const items = r.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((ln) => {
          const [name, short, head] = ln.split("\t");
          return { name, short, current: head === "*" };
        });
      return { ws, items };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitCheckout",
    description: "Checkout an existing branch",
    parameters: {
      type: "object",
      required: ["ws", "name"],
      properties: { ws: { type: "string" }, name: { type: "string" } },
      additionalProperties: false,
    },
    handler: async ({ ws, name }) => {
      const cwd = await getCwd(ws);
      const r = await runGit(cwd, ["checkout", name]);
      return r.ok ? { ok: true } : { error: r.error };
    },
    tags: ["GIT"],
  });

  // New: push and pull
  tools.define({
    name: "gitPush",
    description:
      "Push the current branch to a remote (default: origin). Optionally specify branch.",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        remote: { type: "string", default: "origin" },
        branch: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async ({ ws, remote = "origin", branch }) => {
      const cwd = await getCwd(ws);
      const br = branch && branch.trim() ? branch : await currentBranch(cwd);
      const r = await runGit(cwd, ["push", remote, br]);
      return r.ok ? { ok: true, output: r.stdout } : { error: r.error };
    },
    tags: ["GIT"],
  });

  tools.define({
    name: "gitPull",
    description:
      "Pull from remote (default origin) for current branch. rebase=true by default.",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        remote: { type: "string", default: "origin" },
        branch: { type: "string" },
        rebase: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    handler: async ({ ws, remote = "origin", branch, rebase = true }) => {
      const cwd = await getCwd(ws);
      const br = branch && branch.trim() ? branch : await currentBranch(cwd);
      const args = ["pull", ...(rebase ? ["--rebase"] : ["--ff-only"]), remote, br];
      const r = await runGit(cwd, args, { timeout: 300000 });
      return r.ok ? { ok: true, output: r.stdout } : { error: r.error };
    },
    tags: ["GIT"],
  });
}
