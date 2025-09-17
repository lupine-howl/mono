import { toolRegistry as rpc } from "@loki/minihttp/util";

export const fsWorkspaces = () => {
  return rpc.$call("fsWorkspaces");
};
export const fsList = (params) => {
  return rpc.$call("fsList", params);
};
export const fsRead = (params) => {
  return rpc.$call("fsRead", params);
};
export const fsBundle = (params) => {
  return rpc.$call("fsBundle", params);
};
export const fsReadSnapshot = (params) => {
  return rpc.$call("fsReadSnapshot", params);
};
export const fsWriteSnapshot = (params) => {
  return rpc.$call("fsWriteSnapshot", params);
};
export const fsWrite = (params) => {
  return rpc.$call("fsWrite", params);
};
export const fsApply = (params) => {
  return rpc.$call("fsApply", params);
};
export const fsMkdir = (params) => {
  return rpc.$call("fsMkdir", params);
};
export const fsRename = (params) => {
  return rpc.$call("fsRename", params);
};
export const fsMove = (params) => {
  return rpc.$call("fsMove", params);
};
export const fsDelete = (params) => {
  return rpc.$call("fsDelete", params);
};
export const fsCopy = (params) => {
  return rpc.$call("fsCopy", params);
};
export const fsTouch = (params) => {
  return rpc.$call("fsTouch", params);
};
export const fsDownload = (params) => {
  return rpc.$call("fsDownload", params);
};
