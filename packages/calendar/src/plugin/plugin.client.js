import { html } from "lit";
import "@loki/calendar/ui/calendar-view.js";
import "@loki/calendar/ui/event-list.js";

export default ({ components }) => {
  components.push({
    body: [
      {
        id: "calendar:view",
        label: "Calendar",
        order: 20,
        wrapperStyle: "card",
        render: () => html`<calendar-view></calendar-view>`,
        left: [
          {
            id: "calendar:event-list",
            label: "Events",
            order: 10,
            render: () => html`<event-list></event-list>`,
          },
        ],
      },
    ],
  });
};
