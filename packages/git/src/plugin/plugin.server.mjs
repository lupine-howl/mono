import { registerGitTools } from "@loki/git";

export default ({ regFunctions }) => {
  regFunctions.registerGitTools = ({ tools, root }) =>
    registerGitTools(tools, { root });
};
