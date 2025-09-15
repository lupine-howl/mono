import { createOpenApiRpcClient } from "@loki/minihttp/util";
const rpc = createOpenApiRpcClient({
  base: typeof location !== "undefined" ? location.origin : "",
  openapiUrl: "/openapi.json",
});

export const gitStatus = rpc.gitStatus;
export const gitAdd = rpc.gitAdd;
export const gitRestore = rpc.gitRestore;
export const gitCommit = rpc.gitCommit;
export const gitLog = rpc.gitLog;
export const gitDiff = rpc.gitDiff;
export const gitBranchList = rpc.gitBranchList;
export const gitCheckout = rpc.gitCheckout;
export const gitPush = rpc.gitPush;
export const gitPull = rpc.gitPull;
export const gitGenerateCommit = rpc.gitGenerateCommit;
