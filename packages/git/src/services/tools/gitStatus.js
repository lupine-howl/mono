function parsePorcelain(txt) {
  // Very simple parser for `git status --porcelain`
  const lines = (txt || "").split(/\r?\n/).filter(Boolean);
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const renamed = [];
  const deleted = [];
  for (const ln of lines) {
    const x = ln.slice(0, 1);
    const y = ln.slice(1, 2);
    // Support rename format: R  old -> new
    // General: XY <path>
    const rest = ln.slice(3).trim();
    const name = rest.includes(" -> ") ? rest.split(" -> ").pop() : rest;
    if (x === "?" || y === "?") {
      untracked.push(name);
    } else {
      if (x !== " " && x !== "?") staged.push(name);
      if (y !== " ") {
        if (y === "R") renamed.push(name);
        else if (y === "D") deleted.push(name);
        else unstaged.push(name);
      }
    }
  }
  return { staged, unstaged, untracked, renamed, deleted };
}

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
