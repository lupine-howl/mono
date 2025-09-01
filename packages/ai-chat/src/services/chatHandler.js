import { makeOpenAIClient } from "./client.js";
import {
  toOpenAIToolsFromRegistry,
  buildMessages,
  maybeExecuteFirstTool,
} from "./util.js";

import { createLogger } from "@loki/http-base/util";

const logger = createLogger({ name: "[@loki/chat-ai]" });

export function mountChatRoute(
  router,
  registry,
  {
    path = "/api/ai",
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4o-mini",
  } = {}
) {
  const client = makeOpenAIClient({ apiKey });

  router.post(path, async (args, ctx) => {
    try {
      const {
        prompt = "",
        system,
        model: m,
        force = false,
        toolName,
        execute = false,
        messages,
        temperature,
        max_completion_tokens = 8192,
        max_tokens,
        tool_choice: requestedToolChoice, // "none" | "auto" | forced
      } = args || {};

      const toolsArray = toOpenAIToolsFromRegistry(registry);
      const msgs = buildMessages({ messages, system, prompt });

      let tool_choice;
      let tools;
      if (requestedToolChoice === "auto") {
        tool_choice = "auto";
        tools = toolsArray;
      } else if (force && toolName) {
        tool_choice = { type: "function", function: { name: toolName } };
        tools = toolsArray.filter((t) => t.function.name === toolName);
      } else {
        tool_choice = "none";
        tools = [];
      }

      const payload = {
        model: m || model,
        messages: msgs,
        tools,
        tool_choice,
        ...(temperature != null ? { temperature } : {}),
        ...(max_completion_tokens != null ? { max_completion_tokens } : {}),
        ...(max_tokens != null ? { max_tokens } : {}),
      };

      logger.info("chat completion payload", { payload });

      const { ok, status, data } = await client.chatCompletions(payload);
      if (!ok) {
        return {
          status,
          json: { error: data?.error?.message || "OpenAI error", data },
        };
      }

      const choice = data?.choices?.[0] || {};
      const message = choice.message || {};
      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls
        : [];
      const firstCall = toolCalls[0] || null;

      let parsedArgs = null;
      if (firstCall?.function?.arguments) {
        try {
          parsedArgs = JSON.parse(firstCall.function.arguments);
        } catch {}
      }

      let execution = null;
      if (execute && firstCall?.function?.name && parsedArgs) {
        execution = await maybeExecuteFirstTool({
          registry,
          toolCall: firstCall,
          args: parsedArgs,
          ctx,
        });
      }

      return {
        status: 200,
        json: {
          sent: { model: payload.model, tool_choice: payload.tool_choice },
          openai: data,
          content: message.content || "",
          tool_call: firstCall,
          tool_args: parsedArgs,
          executed_result: execution,
        },
      };
    } catch (err) {
      return { status: 500, json: { error: err?.message || String(err) } };
    }
  });
}
