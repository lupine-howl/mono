// src/shared/services/ai-chat/submit.js
import { buildChatMessages } from "./buildMessages.js";
import { pushMessage, updateMessage } from "./persistence.js";
import { safeParse } from "./helpers.js";
import { toolsService } from "@loki/minihttp/util";

/** Pretty-print friendly rationale from tool_meta */
function formatToolMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return null;
  const { summary, why, key_params, safety, confidence, next } = meta;
  if (!summary && !why && !key_params && !safety && !next) return null;

  const parts = [];
  if (summary) parts.push(summary.trim());
  const bullets = [];
  /*
  if (why) bullets.push(`**Why this tool**:\n${why.trim()}`);
  if (key_params) bullets.push(`**Key inputs**: ${key_params.trim()}`);
  if (safety) bullets.push(`**Safety/Notes**: ${safety.trim()}`);
  if (typeof confidence === "number") {
    bullets.push(`**Confidence**: ${Math.round(confidence * 100)}%`);
  }
  */
  if (next) bullets.push(`**Next**: ${next.trim()}`);

  if (bullets.length) parts.push(bullets.map((b) => `- ${b}`).join("\n"));
  return parts.join("\n\n");
}

export async function submit(svc, prompt) {
  const text = String(prompt || "").trim();
  if (!text) return;

  const ctx = [];
  if (svc.state.context) ctx.push(...svc.state.context);
  if (svc.state.attachments?.length) ctx.push(...svc.state.attachments);

  // user message
  const userId = pushMessage(svc, {
    role: "user",
    content: text,
    kind: "chat",
    attachments: ctx,
  });

  // placeholder assistant message (child of user)
  let placeholderId = pushMessage(svc, {
    role: "assistant",
    content: "Thinking...",
    kind: "tool_waiting",
    parentId: userId,
  });

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
      ["force", "run"].includes(svc.state.mode) &&
      (svc.state.toolName || toolsService.get()?.toolName)
    ) {
      payload.toolName = svc.state.toolName || toolsService.get()?.toolName;
      payload.force = true;
      if (svc.state.mode === "run") payload.execute = true;
    } else if (svc.state.mode === "auto") {
      payload.tool_choice = "auto";
    }

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

    if (js.content) {
      updateMessage(svc, placeholderId, {
        role: "assistant",
        content: js.content,
        kind: "chat",
      });
    }

    const called = js?.tool_call?.function?.name || "";
    // Prefer server-supplied clean args/meta; strip _meta if needed
    let args = js?.tool_args;
    let meta = js?.tool_meta;

    if (!args) {
      const raw =
        typeof js?.tool_call?.function?.arguments === "string"
          ? safeParse(js.tool_call.function.arguments)
          : js?.tool_call?.function?.arguments;
      if (raw && typeof raw === "object") {
        const { _meta, ...clean } = raw;
        args = clean;
        if (!meta && _meta) meta = _meta;
      }
    }

    if (called && args && svc.state.mode !== "off") {
      // ---- STRIP META BEFORE USING ----
      const { _meta: _discard, ...cleanArgs } = args;
      args = cleanArgs;

      await toolsService.setTool(called);
      toolsService.setValues({ ...args });
      svc.set({ toolName: called, toolArgs: { ...args } });

      // show friendly rationale first
      const metaText = formatToolMeta(meta);
      if (metaText) {
        updateMessage(svc, placeholderId, {
          role: "assistant",
          content: metaText,
          kind: "chat",
        });
        placeholderId = pushMessage(svc, {
          role: "assistant",
          content: JSON.stringify({ called, args }, null, 2),
          kind: "tool_request",
          name: called,
          args,
          meta,
          parentId: userId,
        });
      } else {
        updateMessage(svc, placeholderId, {
          role: "assistant",
          content: JSON.stringify({ called, args }, null, 2),
          kind: "tool_request",
          name: called,
          args,
        });
      }

      if (svc.state.mode === "run") {
        await svc.confirmToolRequest(placeholderId);
      } else if (
        !Object.prototype.hasOwnProperty.call(js, "executed_result") &&
        svc.state.autoExecute
      ) {
        await svc.confirmToolRequest(placeholderId);
      }
    }
  } catch (e) {
    svc.log("submit error", e);
    updateMessage(svc, placeholderId, {
      role: "assistant",
      content: `⚠️ ${e}`,
      kind: "chat",
    });
  } finally {
    svc.set({ loading: false });
  }
}
