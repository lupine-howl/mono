import { runGit, getCwd } from "@loki/git/helpers";

export const gitRestore = {
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
  handler: async ({ ws, paths = [], stagedOnly = false, worktree = false }) => {
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
};
