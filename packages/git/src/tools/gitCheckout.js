import { runGit, getCwd } from "@loki/git/helpers";

export const gitCheckout = {
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
};
