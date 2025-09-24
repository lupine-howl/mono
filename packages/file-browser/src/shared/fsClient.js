import { call } from "@loki/minihttp/util";

export const fsWorkspaces = () => {
  return call("fsWorkspaces");
};
export const fsList = (params) => {
  return call("fsList", params);
};
export const fsRead = (params) => {
  return call("fsRead", params);
};
export const fsBundle = (params) => {
  return call("fsBundle", params);
};
export const fsReadSnapshot = (params) => {
  return call("fsReadSnapshot", params);
};
export const fsWriteSnapshot = (params) => {
  return call("fsWriteSnapshot", params);
};
export const fsWrite = (params) => {
  return call("fsWrite", params);
};
export const fsApply = (params) => {
  return call("fsApply", params);
};
export const fsMkdir = (params) => {
  return call("fsMkdir", params);
};
export const fsRename = (params) => {
  return call("fsRename", params);
};
export const fsMove = (params) => {
  return call("fsMove", params);
};
export const fsDelete = (params) => {
  return call("fsDelete", params);
};
export const fsCopy = (params) => {
  return call("fsCopy", params);
};
export const fsTouch = (params) => {
  return call("fsTouch", params);
};
export const fsDownload = (params) => {
  return call("fsDownload", params);
};
