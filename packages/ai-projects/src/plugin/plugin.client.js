// src/ui/plugin.js
import { html } from "lit";
import "@loki/ai-projects/ui/project-list.js";
import "@loki/ai-projects/ui/conversation-list.js";
import "@loki/ai-projects/ui/project-viewer.js";

export default ({ components }) => {
  const ns = "chat-project";
  components.push({
    sidebar: [
      {
        id: `${ns}:projects`,
        label: "Projects",
        order: 1,
        render: () => html`<project-list></project-list>`,
      },
      {
        id: `${ns}:conversations`,
        label: "Chats",
        order: 2,
        render: () => html`<chat-conversation-list></chat-conversation-list>`,
      },
    ],
    body: [
      {
        id: `${ns}:project`,
        label: "📁 Project",
        order: 15,
        render: () => html`<project-viewer></project-viewer>`,
      },
    ],
  });
};
