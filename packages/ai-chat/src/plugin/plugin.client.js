// src/ui/plugin.js
import { html } from "lit";
import "@loki/ai-chat/ui/chat-stream.js";
import "@loki/ai-chat/ui/chat-composer.js";
import "@loki/ai-chat/ui/chat-tool-select.js";
import "@loki/ai-chat/ui/model-select.js";
import "@loki/ai-chat/ui/context-viewer.js";
import "@loki/ai-chat/ui/attachment-picker.js";
import * as aiTools from "@loki/ai-chat/tools";

export default ({ components, tools }) => {
  console.log(aiTools);
  tools.defineMany({ ...aiTools });
  const ns = "chat";

  components.push({
    body: [
      {
        id: `${ns}:chat`,
        label: "💬 Chat",
        order: 1,
        render: () => html`<chat-stream></chat-stream> `,
      },
      {
        id: `${ns}:context`,
        label: "🧩 Context",
        order: 20,
        wrapperStyle: "card",
        render: () => html`<context-viewer></context-viewer>`,
      },
    ],
    gutterLeft: [
      {
        id: `${ns}:model`,
        label: "🤖 Model",
        order: 10,
        render: () => html`<model-select></model-select>`,
      },
    ],
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
  });
};
