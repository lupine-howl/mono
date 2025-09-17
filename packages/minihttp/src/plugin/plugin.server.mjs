import { registerFsTools } from "@loki/file-browser";
import * as toolsToolsToools from "@loki/minihttp/tools";

export default ({ regFunctions, tools }) => {
  tools.defineMany(toolsToolsToools);
  regFunctions.registerFsTools = ({ tools }) => registerFsTools(tools);
};
