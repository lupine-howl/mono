import { eventsSchema } from "@loki/calendar/schemas/events.schema.js";
import { registerCalendarTools } from "@loki/calendar";

export default ({ schemas, regFunctions }) => {
  // Ensure the DB has an "events" table by registering the schema
  schemas.events = eventsSchema;

  // Register server tools (RPC) for creating one or many events
  regFunctions.registerCalendarTools = ({ tools }) => registerCalendarTools(tools);
};
