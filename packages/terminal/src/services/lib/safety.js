import * as path from "node:path";

export const makeEnsureWs = (workspaces) => (ws) => {
  const w = workspaces[ws];
  if (!w) throw new Error("Unknown workspace");
  return w;
};

export const safeJoin = (root, rel) => {
  const full = path.resolve(root, rel || ".");
  if (!full.startsWith(root)) throw new Error("Path traversal blocked");
  return full;
};
