import { createOpenApiRpcClient } from "@loki/minihttp/util";
const rpc = createOpenApiRpcClient({
  base: typeof location !== "undefined" ? location.origin : "",
  openapiUrl: "/openapi.json",
});

export const fsWorkspaces = rpc.fsWorkspaces;
export const fsList = rpc.fsList;
export const fsRead = rpc.fsRead;
export const fsBundle = rpc.fsBundle;
export const fsSnapshot = rpc.fsSnapshot;
export const fsWrite = rpc.fsWrite;
export const fsApply = rpc.fsApply;
export const fsMkdir = rpc.fsMkdir;
export const fsRename = rpc.fsRename;
export const fsMove = rpc.fsMove;
export const fsDelete = rpc.fsDelete;
export const fsCopy = rpc.fsCopy;
export const fsTouch = rpc.fsTouch;
export const fsDownload = rpc.fsDownload;
