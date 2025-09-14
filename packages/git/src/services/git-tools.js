import { configureFs } from "@loki/file-browser";

// Import command specs
import { gitStatus } from "./tools/gitStatus.js";
import { gitAdd } from "./tools/gitAdd.js";
import { gitRestore } from "./tools/gitRestore.js";
import { gitCommit } from "./tools/gitCommit.js";
import { gitLog } from "./tools/gitLog.js";
import { gitDiff } from "./tools/gitDiff.js";
import { gitBranchList } from "./tools/gitBranchList.js";
import { gitCheckout } from "./tools/gitCheckout.js";
import { gitPush } from "./tools/gitPush.js";
import { gitPull } from "./tools/gitPull.js";

export function registerGitTools(tools, { root } = {}) {
  // Configure FS root once (optional if WS_ROOT/WORKSPACES_ROOT env is set)
  if (root) configureFs({ root });

  const specs = [
    gitStatus,
    gitAdd,
    gitRestore,
    gitCommit,
    gitLog,
    gitDiff,
    gitBranchList,
    gitCheckout,
    gitPush,
    gitPull,
  ];

  for (const spec of specs) {
    tools.define(spec);
  }
}
