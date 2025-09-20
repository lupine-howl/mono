import { EventLogger } from "@loki/events/ui";

export default ({ components, schemas, tools }) => {
  components.push({
    body: [
      {
        id: `events:logger`,
        label: "🪵 Event Log",
        order: 20,
        wrapperStyle: "card",
        component: EventLogger,
      },
    ],
  });
};
