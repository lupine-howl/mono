// src/shared/services/ai-chat/submitWithTool.js
import { submit } from "./submit.js";
import { toolsService } from "@loki/minihttp/util";

/**
 * Fire a one-off AI chat call that:
 *  - injects transient context (system/user attachments),
 *  - forces a specific tool (by name),
 *  - chooses whether to execute the tool or just request it,
 *  - and then restores the service state afterward (optional).
 *
 * Usage:
 *   await submitWithTool(aiSvc, {
 *     prompt: "Prepare a commit message and run it",
 *     toolName: "gitCommit",
 *     execute: true,     // true: mode "run" (execute); false: "force" (request only)
 *     context: [...],    // array of {role, content} or plain strings (treated as system)
 *     attachments: [...],// extra attachment objects if you use them
 *     model: "gpt-4o-mini", // optional override
 *     persona: "default",   // optional override
 *     restore: true,        // restore previous svc.state.* after call
 *   });
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
  const ctxEntries = (context || []).map((c) =>
    typeof c === "string" ? { role: "system", content: c } : c
  );

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
      attachments: [...(prev.attachments || []), ...attachments],
      ...(typeof autoExecute === "boolean" ? { autoExecute } : {}),
    });

    // Also set the active tool in toolsService so submit() sees it
    await toolsService.setTool(toolName);

    // Trigger the normal submit flow
    await submit(svc, prompt ?? `Use ${toolName} with the provided context.`);

    // After submit(), your existing logic already:
    // - surfaces a tool_request message,
    // - sets svc.state.toolName/toolArgs,
    // - executes immediately when mode === "run".
    //
    // If the caller wants the filled args (even in "force" mode), they can read:
    //   const { toolName, toolArgs } = svc.state;
    // or listen to your existing message stream.
  } finally {
    if (restore) {
      // Restore prior state so this call is side-effect free
      svc.set(prev);
    }
  }
}
