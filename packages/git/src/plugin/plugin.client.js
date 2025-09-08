// src/plugin/plugin.client.js (git)
import { html } from "lit";
import "@loki/file-browser/ui/workspace-select.js";
import "../ui/git-staged.js";
import "../ui/git-commit.js";
import "../ui/git-history.js";

export default ({ components }) => {
  const ns = "git";
  components.push({
    body: [
      {
        id: `${ns}:commit`,
        label: "🧩 Git Commit",
        order: 30,
        render: () => html`<git-commit></git-commit>`,
      },
      {
        id: `${ns}:history`,
        label: "📜 History",
        order: 31,
        render: () => html`<git-history></git-history>`,
      },
    ],
    sidebar: [
      {
        id: `${ns}:workspace-select`,
        label: "📁 Workspaces",
        order: 10,
        render: () => html`<workspace-select></workspace-select>`,
      },
      {
        id: `${ns}:staged`,
        label: "🗂️ Changes",
        order: 20,
        render: () => html`<git-staged></git-staged>`,
      },
    ],
  });
};
