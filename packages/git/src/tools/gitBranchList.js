import { runGit, getCwd } from "./helpers.js";

export const gitBranchList = {
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
};
