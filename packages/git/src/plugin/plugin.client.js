// src/plugin/plugin.client.js (git)
import { html } from "lit";
import "@loki/file-browser/ui/workspace-select.js";
import "@loki/file-viewer-advanced/ui/file-viewer-advanced.js";
import "../ui/git-staged.js";
import "../ui/git-commit.js";
import "../ui/git-history.js";
import "../ui/git-sync.js";
import * as gitTools from "@loki/git/tools";

export default ({ components, tools }) => {
  tools.defineMany(gitTools);
  const ns = "git";
  components.push({
    body: [
      {
        id: `${ns}:history`,
        label: "🔁 Git",
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
        label: "{ } Code",
        order: 31,
        render: () => html`<file-viewer-advanced></file-viewer-advanced>`,
        left: [
          {
            id: `code:workspace-select`,
            label: "📁 Workspaces",
            order: 30,
            render: () => html`<workspace-select></workspace-select>`,
          },
          {
            id: `file-browser`,
            label: "📁 Files",
            order: 30,
            ws: "packages/file-browser",
            path: "src/ui/file-browser.js",
            render: () => html`<file-browser></file-browser>`,
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
