import { registerAITools } from "@loki/ai-chat";
import { projectsSchema } from "@loki/ai-projects/schemas/Projects.schema.js";
import { conversationsSchema } from "@loki/ai-projects/schemas/Conversations.schema.js";

import { messagesSchema } from "@loki/ai-chat/schemas/Messages.schema.js";
export default ({ schemas, regFunctions }) => {
  Object.assign(schemas, {
    messages: messagesSchema,
    projects: projectsSchema,
    conversations: conversationsSchema,
  });
  regFunctions.registerAITools = ({ tools, router }) =>
    registerAITools({ tools, router }, { apiKey: process.env.OPENAI_API_KEY });
};
