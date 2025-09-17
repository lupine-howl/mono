import { messagesSchema } from "@loki/ai-chat/schemas/Messages.schema.js";
import { registerAITools } from "@loki/ai-chat";
import * as aiTools from "@loki/ai-chat/tools";

export default ({ schemas, regFunctions, tools }) => {
  schemas.messages = messagesSchema;
  tools.defineMany({ ...aiTools });
  regFunctions.registerAITools = ({ tools, router }) =>
    registerAITools({ tools, router }, { apiKey: process.env.OPENAI_API_KEY });
};
