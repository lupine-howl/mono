import { call } from "@loki/minihttp/util";

export const gitStatus = () => {
  return call("gitStatus");
};
export const gitAdd = () => {
  return call("gitAdd");
};
export const gitRestore = () => {
  return call("gitRestore");
};
export const gitCommit = () => {
  return call("gitCommit");
};
export const gitLog = () => {
  return call("gitLog");
};
export const gitDiff = () => {
  return call("gitDiff");
};
export const gitBranchList = () => {
  return call("gitBranchList");
};
export const gitCheckout = () => {
  return call("gitCheckout");
};
export const gitPush = () => {
  return call("gitPush");
};
export const gitPull = () => {
  return call("gitPull");
};
export const gitGenerateCommit = () => {
  return call("gitGenerateCommit");
};
