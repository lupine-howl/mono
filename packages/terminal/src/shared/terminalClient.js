import { createOpenApiRpcClient } from "@loki/minihttp/util";
const rpc = createOpenApiRpcClient({
  base: typeof location !== "undefined" ? location.origin : "",
  openapiUrl: "/openapi.json",
});

export const termWorkspaces = rpc.termWorkspaces;
export const termProcExec = rpc.termProcExec;
export const termShExec = rpc.termShExec;
