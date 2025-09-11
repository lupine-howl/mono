// src/ui/plugin.js
import { html } from "lit";
import "@loki/ai-chat/ui/chat-stream.js";
import "@loki/ai-chat/ui/chat-alerts.js";
import "@loki/ai-chat/ui/chat-composer.js";
import "@loki/ai-chat/ui/model-select.js";
import "@loki/ai-chat/ui/context-viewer.js";
import "@loki/ai-projects/ui/project-list.js";
import "@loki/ai-projects/ui/conversation-list.js";
import "@loki/ai-projects/ui/project-viewer.js";
import "@loki/file-browser/ui/workspace-select.js";
import "@loki/file-browser/ui/file-browser.js";

export default ({ components }) => {
  const ns = "chat-project";
  components.push({
    composer: [
      {
        id: `${ns}:composer`,
        label: "Composer",
        order: 100,
        render: () => {
          return html` <chat-composer></chat-composer> `;
        },
      },
    ],
    alerts: [
      {
        id: `${ns}:alerts`,
        label: "Alerts",
        order: 100,
        render: () => {
          return html` <chat-alerts></chat-alerts> `;
        },
      },
    ],
    body: [
      {
        id: `${ns}:context`,
        label: "🧩 Context",
        order: 20,
        wrapperStyle: "card",
        render: () => html`<context-viewer></context-viewer>`,
        left:[
      {
        id: `${ns}:workspace-select`,
        label: "📁 Workspaces",
        order: 30,
        render: () => html`<workspace-select></workspace-select>`,
      },
      {
        id: `${ns}:browser`,
        label: "📁 Files",
        order: 30,
        render: () => html`<file-browser></file-browser>`,
      },
    ],
      },
      {
        id: `${ns}:project`,
        label: "📁 Project",
        order: 2,
        render: () => html`<project-viewer></project-viewer>`,
        left: [
          {
            id: `${ns}:model`,
            label: "🤖 Model",
            order: 10,
            render: () => html`<model-select></model-select>`,
          },

          {
            id: `${ns}:projects`,
            label: "Projects",
            order: 2,
            render: () => html`<project-list></project-list>`,
          },
          {
            id: `${ns}:conversations`,
            label: "Chats",
            order: 2,
            render: () =>
              html`<chat-conversation-list></chat-conversation-list>`,
          },
        ],
      },
      {
        id: `${ns}:stream`,
        label: "💬 Chat",
        order: 2,
        render: () => html`<chat-stream></chat-stream>`,
        left: [
          {
            id: `${ns}:model`,
            label: "🤖 Model",
            order: 10,
            render: () => html`<model-select></model-select>`,
          },
          {
            id: `${ns}:projects`,
            label: "Projects",
            order: 2,
            render: () => html`<project-list></project-list>`,
          },
          {
            id: `${ns}:conversations`,
            label: "Chats",
            order: 2,
            render: () =>
              html`<chat-conversation-list></chat-conversation-list>`,
          },
        ],
      },
    ],
  });
};
