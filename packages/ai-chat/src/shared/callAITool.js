// src/shared/services/ai-chat/submitWithTool.js
import { submit } from "./submit.js";
import { toolsService } from "@loki/minihttp/util";

/**
 * Fire a one-off AI chat call with transient context + forced tool.
 */
export async function callAITool(
  svc,
  {
    prompt,
    toolName,
    execute = false,
    context = [],
    attachments = [],
    model,
    persona,
    restore = true,
    autoExecute, // optional hard override of svc.state.autoExecute
  } = {}
) {
  if (!toolName) throw new Error("submitWithTool: toolName is required");

  // 🚫 Do NOT pre-wrap context here. Let buildChatMessages normalize it.
  // - If caller provides strings, they’ll become system messages.
  // - If caller provides {role, content}, they’ll be passed through as-is.
  const ctxEntries = Array.isArray(context) ? context : [context];

  let response;

  // Snapshot state so this is truly transient
  const prev = {
    mode: svc.state.mode,
    toolName: svc.state.toolName,
    model: svc.state.model,
    persona: svc.state.persona,
    context: svc.state.context,
    attachments: svc.state.attachments,
    autoExecute: svc.state.autoExecute,
  };

  try {
    // Hydrate transient overrides
    svc.set({
      mode: execute ? "run" : "force", // "run" => execute; "force" => request only
      toolName,
      model: model ?? prev.model,
      persona: persona ?? prev.persona,
      context: [...(prev.context || []), ...ctxEntries],
      attachments: [...(prev.attachments || []), ...(attachments || [])],
      ...(typeof autoExecute === "boolean" ? { autoExecute } : {}),
    });

    // Also set the active tool in toolsService so submit() sees it
    await toolsService.setTool(toolName);

    // Trigger the normal submit flow
    response = await submit(
      svc,
      prompt ?? `Use ${toolName} with the provided context.`
    );
  } finally {
    if (restore) {
      // Restore prior state so this call is side-effect free
      svc.set(prev);
    }
  }
  return response;
}
