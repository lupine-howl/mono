import * as gitTools from "@loki/git/tools";

export default async ({ tools }) => {
  tools.defineMany(gitTools);
};
