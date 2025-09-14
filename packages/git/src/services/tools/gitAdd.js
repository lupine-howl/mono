import { runGit, getCwd } from "./helpers.js";

export const gitAdd = {
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
    const args = all || paths.length === 0 ? ["add", "-A"] : ["add", ...paths];
    const r = await runGit(cwd, args);
    return r.ok ? { ok: true } : { error: r.error };
  },
  tags: ["GIT"],
};
