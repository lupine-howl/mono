import { html } from "lit";
import "@loki/calendar/ui/calendar-view.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: "calendar:view",
        label: "Calendar",
        order: 20,
        wrapperStyle: "card",
        render: () => html`<calendar-view></calendar-view>`,
      },
    ],
  });
};
