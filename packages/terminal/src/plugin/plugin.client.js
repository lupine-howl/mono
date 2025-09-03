import { html } from "lit";
import "@loki/terminal/ui/terminal-viewer.js";

export default ({ components }) => {
  const ns = "terminal";
  components.push({
    sidebar: [],
    body: [
      {
        id: `${ns}:viewer`,
        label: "🖥️ Terminal",
        order: 35,
        wrapperStyle: "card",
        render: () => html`<terminal-viewer></terminal-viewer>`,
      },
    ],
  });
};
