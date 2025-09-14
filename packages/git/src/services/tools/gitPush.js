
import { runGit, getCwd, currentBranch } from "../helpers.js";

export const gitPush = {
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
};
