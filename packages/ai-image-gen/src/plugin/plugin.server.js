import { registerAIImageTools } from "@loki/ai-image-gen";

export default ({ schemas, regFunctions }) => {
  regFunctions.registerAIImageTools = ({ tools, router }) =>
    registerAIImageTools(
      { tools, router },
      { apiKey: process.env.OPENAI_API_KEY }
    );
};
