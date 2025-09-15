import { runGit, getCwd } from "./helpers.js";

export const gitCommit = {
  name: "gitCommit",
  ws: "packages/git",
  path: "src/tools/gitCommit.js",
  description: "Create a commit from staged changes.",
  parameters: {
    type: "object",
    required: ["ws", "subject", "body"],
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
};
