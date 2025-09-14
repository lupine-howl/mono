
import { runGit, getCwd, GIT_DEFAULTS } from "../helpers.js";

export const gitDiff = {
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
      : ["diff", ...(cached ? ["--cached"] : []), "--no-color", ...(p ? ["--", p] : [])];
    const r = await runGit(cwd, args, { timeout: GIT_DEFAULTS.timeouts.diff });
    return r.ok ? { ws, diff: r.stdout } : { error: r.error };
  },
  tags: ["GIT"],
};
