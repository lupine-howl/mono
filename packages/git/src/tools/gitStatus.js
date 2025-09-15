import { runGit, getCwd, parsePorcelain } from "./helpers.js";

export const gitStatus = {
  name: "gitStatus",
  description: "Get git status (staged, unstaged, untracked) and branch info",
  parameters: {
    type: "object",
    required: ["ws"],
    properties: { ws: { type: "string" } },
    additionalProperties: false,
  },
  safe: true,
  handler: async ({ ws }) => {
    const cwd = await getCwd(ws);
    const [branchRes, porcelainRes, aheadBehindRes] = await Promise.all([
      runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
      runGit(cwd, ["status", "--porcelain"]),
      runGit(cwd, [
        "rev-list",
        "--left-right",
        "--count",
        "@{upstream}...HEAD",
      ]).catch(() => ({ ok: true, stdout: "0\t0" })),
    ]);
    const branch = branchRes.ok ? branchRes.stdout.trim() : "";
    const { staged, unstaged, untracked, renamed, deleted } = parsePorcelain(
      porcelainRes.ok ? porcelainRes.stdout : ""
    );
    const [behindStr, aheadStr] = (aheadBehindRes.stdout || "0\t0")
      .trim()
      .split(/\s+/);
    const ahead = Number(aheadStr || 0);
    const behind = Number(behindStr || 0);
    return {
      ws,
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      renamed,
      deleted,
    };
  },
  tags: ["GIT"],
};
