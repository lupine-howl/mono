import { messagesSchema } from "@loki/ai-chat/schemas/Messages.schema.js";
import { registerAITools } from "@loki/ai-chat";

export default ({ schemas, regFunctions }) => {
  schemas.messages = messagesSchema;
  regFunctions.registerAITools = ({ tools, router }) =>
    registerAITools({ tools, router }, { apiKey: process.env.OPENAI_API_KEY });
};
