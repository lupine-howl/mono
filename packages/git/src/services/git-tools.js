import { configureFs } from "@loki/file-browser";

// Import command specs
import { gitStatus } from "./commands/gitStatus.js";
import { gitAdd } from "./commands/gitAdd.js";
import { gitRestore } from "./commands/gitRestore.js";
import { gitCommit } from "./commands/gitCommit.js";
import { gitLog } from "./commands/gitLog.js";
import { gitDiff } from "./commands/gitDiff.js";
import { gitBranchList } from "./commands/gitBranchList.js";
import { gitCheckout } from "./commands/gitCheckout.js";
import { gitPush } from "./commands/gitPush.js";
import { gitPull } from "./commands/gitPull.js";

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
