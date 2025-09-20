// src/ui/plugin.js
import { html } from "lit";
import "@loki/minihttp/ui/tool-list.js";
import "@loki/minihttp/ui/tool-viewer.js";
import "@loki/minihttp/ui/tool-console.js";
import "@loki/minihttp/ui/tool-directory.js";
import * as toolsToolsToools from "@loki/minihttp/tools";
import { EventLogger, EventLoggerAll } from "@loki/events/ui";

export default ({ components, tools }) => {
  tools.defineMany(toolsToolsToools);
  components.push({
    body: [
      {
        id: `tool-viewer`,
        label: "📁 Tools",
        order: 30,
        noTab: true,
        render: () => html`<tool-viewer></tool-viewer>`,
        left: [
          {
            id: `tool-list`,
            label: "📁 Tools",
            order: 30,
            ws: "packages/minihttp",
            path: "src/ui/tool-list.js",
            render: () => html`<tool-list></tool-list>`,
          },
        ],
      },
      {
        id: `tool-console`,
        label: "🧰 Console",
        order: 30,
        render: () => html`<tool-console></tool-console>`,
        left: [
          {
            id: `events:logger`,
            label: "🪵 Events",
            order: 30,
            ws: "packages/events",
            path: "src/ui/EventLogger.js",
            render: () => html`<event-logger></event-logger>`,
          },
          {
            id: `tool-list`,
            label: "📁 Tools",
            order: 30,
            ws: "packages/minihttp",
            path: "src/ui/tool-list.js",
            render: () => html`<tool-list></tool-list>`,
          },
        ],
      },
      {
        id: `tool-directory`,
        label: "🧰 Tools",
        order: 31,
        render: () => html`<tool-directory></tool-directory>`,
        left: [
          {
            id: `tool-list`,
            label: "📁 Tools",
            order: 30,
            ws: "packages/minihttp",
            path: "src/ui/tool-list.js",
            render: () => html`<tool-list></tool-list>`,
          },
        ],
      },
    ],
  });
};
