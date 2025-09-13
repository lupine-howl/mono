import { registerFsTools } from "@loki/file-browser";

export default ({ regFunctions }) => {
  regFunctions.registerFsTools = ({ tools }) => registerFsTools(tools);
};
