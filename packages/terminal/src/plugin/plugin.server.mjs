import { registerTerminalTools } from "@loki/terminal";
import { defaultWorkspaces as workspaces } from "@loki/file-browser";

export default ({ regFunctions }) => {
  regFunctions.registerTerminalTools = ({ tools, logEntry }) =>
    registerTerminalTools(tools, { workspaces, logEntry });
};
