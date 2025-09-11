// src/shared/services/ai-chat/submit.js
import { buildChatMessages } from "./buildMessages.js";
import { pushMessage, updateMessage } from "./persistence.js";
import { safeParse } from "./helpers.js";
import { toolsService } from "@loki/minihttp/util";

export async function submit(svc, prompt) {
  const text = String(prompt || "").trim();
  if (!text) return;

  const ctx = [];
  if (svc.state.context) ctx.push(...svc.state.context);
  if (svc.state.attachments?.length) ctx.push(...svc.state.attachments);

  // 1) user message
  pushMessage(svc, {
    role: "user",
    content: text,
    kind: "chat",
    attachments: ctx,
  });

  // 2 assistant response (placeholder)
  let requestId = pushMessage(svc, {
    role: "assistant",
    content: "Thinking...",
    kind: "tool_waiting",
  });

  // 2) UI intent
  svc.set({ loading: true });

  try {
    const messages = buildChatMessages({
      persona: svc.state.persona,
      customInstructions: svc.state.customInstructions,
      history: svc.state.messages,
      context: ctx,
    });

    const payload = { model: svc.state.model || undefined, messages };
    if (svc.state.mode === "off") payload.tool_choice = "none";
    else if (
      svc.state.mode === "force" &&
      (svc.state.toolName || toolsService.get()?.toolName)
    ) {
      payload.toolName = svc.state.toolName || toolsService.get()?.toolName;
      payload.force = true;
    } else if (
      svc.state.mode === "run" &&
      (svc.state.toolName || toolsService.get()?.toolName)
    ) {
      payload.toolName = svc.state.toolName || toolsService.get()?.toolName;
      payload.force = true;
      payload.execute = true;
    } else if (svc.state.mode === "auto") payload.tool_choice = "auto";

    svc.set({ lastPayload: payload });
    svc.log("submit →", payload);

    const r = await fetch(svc.state.aiEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const js = await r.json();
    svc.log("submit ←", { ok: r.ok, status: r.status, js });
    if (!r.ok) throw new Error(js?.error || `${r.status} ${r.statusText}`);

    svc.set({ aiResult: js });

    if (js.content)
      updateMessage(svc, requestId, {
        role: "assistant",
        content: js.content,
        kind: "chat",
      });

    const called = js?.tool_call?.function?.name || "";
    const args =
      js?.args ??
      (typeof js?.tool_call?.function?.arguments === "string"
        ? safeParse(js.tool_call.function.arguments)
        : js?.tool_call?.function?.arguments);

    if (called && args && svc.state.mode !== "off") {
      // Update ToolsService (truth) + optional UI mirrors
      await toolsService.setTool(called);
      toolsService.setValues({ ...args });
      svc.set({ toolName: called, toolArgs: { ...args } });

      const toolMessage = {
        role: "assistant",
        content: JSON.stringify({ called, args }, null, 2),
        kind: "tool_request",
        name: called,
        args,
      };
      if (args.ephemeral_comment) {
        updateMessage(svc, requestId, {
          role: "assistant",
          content: args.ephemeral_comment,
          kind: "chat",
        });
        requestId = pushMessage(svc, toolMessage);
      } else {
        updateMessage(svc, requestId, toolMessage);
      }
      svc.log("queued tool_request", { requestId, called, args });

      if (svc.state.mode === "run") svc.confirmToolRequest(requestId);

      if (Object.prototype.hasOwnProperty.call(js, "executed_result")) {
        svc.log("server already executed tool", called);
      } else if (svc.state.autoExecute) {
        await svc.confirmToolRequest(requestId);
      }
    }
  } catch (e) {
    svc.log("submit error", e);
    updateMessage(svc, requestId, {
      role: "assistant",
      content: `⚠️${e}`,
      kind: "chat",
    });
  } finally {
    svc.set({ loading: false });
  }
}
