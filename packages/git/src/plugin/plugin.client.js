// src/plugin/plugin.client.js (git)
import { html } from "lit";
import "@loki/file-browser/ui/workspace-select.js";
import "@loki/file-viewer-advanced/ui/file-viewer-advanced.js";
import "../ui/git-staged.js";
import "../ui/git-commit.js";
import "../ui/git-history.js";
import "../ui/git-sync.js";

export default ({ components }) => {
  const ns = "git";
  components.push({
    body: [
      {
        id: `${ns}:history`,
        label: "📜 History",
        order: 31,
        render: () => html`<git-history></git-history>`,
        left: [
          {
            id: `${ns}:sync`,
            label: "🔁 Sync",
            order: 12,
            render: () => html`<git-sync></git-sync>`,
          },
          {
            id: `${ns}:staged`,
            label: "🗂️ Changes",
            order: 20,
            render: () => html`<git-staged></git-staged>`,
          },
          {
            id: `${ns}:commit`,
            label: "🧩 Git Commit",
            order: 30,
            render: () => html`<git-commit></git-commit>`,
          },
        ],
      },
      {
        id: `${ns}:code`,
        label: "📄 Code",
        order: 31,
        render: () => html`<file-viewer-advanced></file-viewer-advanced>`,
        left: [
          {
            id: `${ns}:sync`,
            label: "🔁 Sync",
            order: 12,
            render: () => html`<git-sync></git-sync>`,
          },
          {
            id: `${ns}:staged`,
            label: "🗂️ Changes",
            order: 20,
            render: () => html`<git-staged></git-staged>`,
          },
          {
            id: `${ns}:commit`,
            label: "🧩 Git Commit",
            order: 30,
            render: () => html`<git-commit></git-commit>`,
          },
        ],
      },
    ],
  });
};
