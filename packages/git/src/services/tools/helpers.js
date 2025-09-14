
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getWorkspacePath } from "@loki/file-browser";

const execFileAsync = promisify(execFile);

// Default process limits for child processes
export const GIT_DEFAULTS = {
  maxBuffer: 10 * 1024 * 1024, // 10 MB
  timeouts: {
    fast: 15000,
    diff: 20000,
    pull: 300000,
  },
};

export async function runGit(cwd, args, { timeout = GIT_DEFAULTS.timeouts.fast } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: GIT_DEFAULTS.maxBuffer,
    });
    return { ok: true, stdout: stdout || "", stderr: stderr || "" };
  } catch (e) {
    const msg = e?.stderr || e?.stdout || e?.message || String(e);
    return { ok: false, error: msg, code: e?.code ?? 1 };
  }
}

export async function ensureRepo(cwd) {
  const r = await runGit(cwd, ["rev-parse", "--git-dir"]);
  if (!r.ok) throw new Error("Not a git repository");
  return true;
}

export async function currentBranch(cwd) {
  const r = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!r.ok) throw new Error(r.error || "Failed to get current branch");
  return r.stdout.trim();
}

// Resolve ws to absolute path, and ensure it's a git repo
export async function getCwd(ws) {
  const p = await getWorkspacePath(ws); // throws if unknown
  await ensureRepo(p);
  return p;
}

// Very small parser for `git status --porcelain`
export function parsePorcelain(txt) {
  const lines = (txt || "").split(/\r?\n/).filter(Boolean);
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const renamed = [];
  const deleted = [];
  for (const ln of lines) {
    const x = ln.slice(0, 1);
    const y = ln.slice(1, 2);
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
