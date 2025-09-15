import { runGit, getCwd } from "./helpers.js";

export const gitLog = {
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
      "-n",
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
        return { hash, short, author, date, subject: rest.join("\t") };
      });
    return { ws, items };
  },
  tags: ["GIT"],
};
