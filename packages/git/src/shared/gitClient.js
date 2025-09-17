import { rpc } from "@loki/minihttp/util";

export const gitStatus = () => {
  return rpc.$call("gitStatus");
};
export const gitAdd = () => {
  return rpc.$call("gitAdd");
};
export const gitRestore = () => {
  return rpc.$call("gitRestore");
};
export const gitCommit = () => {
  return rpc.$call("gitCommit");
};
export const gitLog = () => {
  return rpc.$call("gitLog");
};
export const gitDiff = () => {
  return rpc.$call("gitDiff");
};
export const gitBranchList = () => {
  return rpc.$call("gitBranchList");
};
export const gitCheckout = () => {
  return rpc.$call("gitCheckout");
};
export const gitPush = () => {
  return rpc.$call("gitPush");
};
export const gitPull = () => {
  return rpc.$call("gitPull");
};
export const gitGenerateCommit = () => {
  return rpc.$call("gitGenerateCommit");
};
