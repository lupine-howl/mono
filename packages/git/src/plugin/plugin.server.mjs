import { gitStatus } from "@loki/git/tools/gitStatus.js";
import { gitAdd } from "@loki/git/tools/gitAdd.js";
import { gitRestore } from "@loki/git/tools/gitRestore.js";
import { gitCommit } from "@loki/git/tools/gitCommit.js";
import { gitLog } from "@loki/git/tools/gitLog.js";
import { gitDiff } from "@loki/git/tools/gitDiff.js";
import { gitBranchList } from "@loki/git/tools/gitBranchList.js";
import { gitCheckout } from "@loki/git/tools/gitCheckout.js";
import { gitPush } from "@loki/git/tools/gitPush.js";
import { gitPull } from "@loki/git/tools/gitPull.js";
import { gitGenerateCommit } from "@loki/git/tools/gitGenerateCommit.js";

export default ({ tools }) => {
  tools.defineMany({
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
    gitGenerateCommit,
  });
};
