import {
  toOpenAIToolsFromRegistry,
  buildMessages,
  maybeExecuteFirstTool,
} from "./util.js";

import { createLogger } from "@loki/http-base/util";

const logger = createLogger({ name: "[@loki/chat-ai]" });

/** Inject a _meta schema into all tools (required), without touching real args */
function injectFriendlyMeta(tools) {
  return tools.map((t) => {
    const fn = t.function || {};
    const params =
      fn.parameters && typeof fn.parameters === "object"
        ? { ...fn.parameters }
        : { type: "object", properties: {}, required: [] };

    const properties = { ...(params.properties || {}) };
    const required = new Set(
      Array.isArray(params.required) ? params.required : []
    );

    // Define the _meta object
    properties._meta = {
      type: "object",
      description:
        "User-visible explanation of this action. Used only for chat display; it will be removed before executing the tool.",
      properties: {
        summary: {
          type: "string",
          description:
            "A detailed and descriptive summary of the action phrased as a response to the latest prompt. Detail what the tool is doing and why in 1–2 sentences.",
        },
        why: {
          type: "string",
          description:
            "Short markdown bullets explaining why this tool was chosen (criteria/trade-offs).",
        },
        key_params: {
          type: "string",
          description:
            "Readable overview of the most important inputs (no raw JSON dumps).",
        },
        safety: {
          type: "string",
          description:
            "Any risks, safeguards, or irreversible side-effects to note (optional).",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Confidence from 0 to 1 (optional).",
        },
        next: {
          type: "string",
          description:
            "What happens after this runs (follow-up or expected output, optional).",
        },
      },
      required: ["summary", "why", "key_params"],
      additionalProperties: false,
    };

    required.add("_meta");

    return {
      ...t,
      function: {
        ...fn,
        parameters: {
          ...params,
          type: "object",
          properties,
          required: Array.from(required),
          // Preserve existing additionalProperties if set; default true.
          additionalProperties:
            typeof params.additionalProperties === "boolean"
              ? params.additionalProperties
              : false,
        },
      },
    };
  });
}

/** A small system nudge that teaches the model how to fill _meta */
function metaSystemNudge() {
  return [
    {
      role: "system",
      content:
        "When calling any tool, you MUST include a `_meta` object with: `summary` (1–2 friendly sentences), `why` (2–5 markdown bullets explaining the choice), `key_params` (2–5 most important inputs in plain English), and optionally `safety`, `confidence` (0–1), and `next`. Keep it concise, specific, and warm. Do not paste raw JSON into `key_params`.",
    },
  ];
}

export function mountChatRoute(
  router,
  registry,
  {
    path = "/api/ai",
    apiKey = process.env.OPENAI_API_KEY,
    model = "gpt-4o-mini",
    baseUrl = "https://api.openai.com/v1",
  } = {}
) {
  async function chatCompletions(payload) {
    const headers = {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    };
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    logger.info("chat completion response", {
      ok: res.ok,
      status: res.status,
      data,
    });
    return { ok: res.ok, status: res.status, data };
  }

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
        max_completion_tokens = 32768,
        temperature,
        max_tokens,
        reasoning = { effort: "low" },
        tool_choice: requestedToolChoice, // "none" | "auto" | forced
      } = args || {};

      // Build tools and inject friendly meta schema
      const baseTools = toOpenAIToolsFromRegistry(registry);
      const toolsWithMeta = injectFriendlyMeta(baseTools);

      // Build messages and append the meta system nudge
      // If buildMessages already handles system composition, we just add an extra system message.
      const msgs = [
        ...metaSystemNudge(),
        ...buildMessages({ messages, system, prompt }),
      ];

      // Determine tool choice + the set of tools to send
      let tool_choice;
      let tools;
      if (requestedToolChoice === "auto") {
        tool_choice = "auto";
        tools = toolsWithMeta;
      } else if (force && toolName) {
        tool_choice = { type: "function", function: { name: toolName } };
        tools = toolsWithMeta.filter((t) => t.function?.name === toolName);
      } else {
        tool_choice = "none";
        tools = [];
      }

      const payload = {
        model: m || model,
        messages: msgs,
        tools,
        tool_choice,
        // reasoning, // uncomment if you’re using Reasoning models that accept this
        ...(temperature != null ? { temperature } : {}),
        ...(max_completion_tokens != null ? { max_completion_tokens } : {}),
        ...(max_tokens != null ? { max_tokens } : {}),
      };

      logger.info("chat completion payload", { payload });

      const { ok, status, data } = await chatCompletions(payload);
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
        } catch {
          // ignore JSON parse error; keep parsedArgs = null
        }
      }

      // Strip _meta before executing tool
      let execution = null;
      let toolMeta = null;
      if (parsedArgs && typeof parsedArgs === "object") {
        const { _meta, ...cleanArgs } = parsedArgs;
        toolMeta = _meta || null;

        if (false && execute && firstCall?.function?.name) {
          execution = await maybeExecuteFirstTool({
            registry,
            toolCall: firstCall,
            args: cleanArgs,
            ctx,
          });
        }

        // Replace parsedArgs shown back to caller with cleaned args (no _meta)
        parsedArgs = { ...cleanArgs };
      }

      return {
        status: 200,
        json: {
          sent: { model: payload.model, tool_choice: payload.tool_choice },
          openai: data,
          content: message.content || "",
          tool_call: firstCall,
          tool_args: parsedArgs,
          tool_meta: toolMeta, // <- for UI to render friendly rationale
          executed_result: execution,
        },
      };
    } catch (err) {
      return { status: 500, json: { error: err?.message || String(err) } };
    }
  });
}
