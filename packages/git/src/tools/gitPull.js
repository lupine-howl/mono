import { runGit, getCwd, currentBranch, GIT_DEFAULTS } from "./helpers.js";

export const gitPull = {
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
    const args = [
      "pull",
      ...(rebase ? ["--rebase"] : ["--ff-only"]),
      remote,
      br,
    ];
    const r = await runGit(cwd, args, { timeout: GIT_DEFAULTS.timeouts.pull });
    return r.ok ? { ok: true, output: r.stdout } : { error: r.error };
  },
  tags: ["GIT"],
};
