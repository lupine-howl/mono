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

  // Prepare an outcome we’ll return at the end
  const outcome = {
    ok: false,
    error: null,
    called: null, // tool name (if any)
    args: null, // tool args (if any)
    meta: null, // tool_meta (if any)
    executed: false, // whether we ran the tool
    executedResult: undefined, // result from execution (if ran)
    ai: null, // raw AI response
    userMessageId: null,
    placeholderMessageId: null,
  };

  if (!text) {
    outcome.ok = false;
    outcome.error = "EMPTY_PROMPT";
    return outcome;
  }

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
  outcome.userMessageId = userId;

  // placeholder assistant message (child of user)
  let placeholderId = pushMessage(svc, {
    role: "assistant",
    content: "Thinking...",
    kind: "tool_waiting",
    parentId: userId,
  });
  outcome.placeholderMessageId = placeholderId;

  svc.set({ loading: true });

  try {
    const messages = buildChatMessages({
      persona: svc.state.persona,
      customInstructions: svc.state.customInstructions,
      history: svc.state.messages,
      context: ctx,
    });

    const payload = { model: svc.state.model || undefined, messages };

    if (svc.state.mode === "off") {
      payload.tool_choice = "none";
    } else if (
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
    outcome.ai = js;

    svc.log("submit ←", { ok: r.ok, status: r.status, js });
    if (!r.ok) throw new Error(js?.error || `${r.status} ${r.statusText}`);

    svc.set({ aiResult: js });

    if (js.content) {
      updateMessage(svc, outcome.placeholderMessageId, {
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

      outcome.called = called;
      outcome.args = { ...args };
      outcome.meta = meta ?? null;

      await toolsService.setTool(called);
      toolsService.setValues({ ...args });
      svc.set({ toolName: called, toolArgs: { ...args } });

      // show friendly rationale first
      const metaText = formatToolMeta(meta);
      if (metaText) {
        updateMessage(svc, outcome.placeholderMessageId, {
          role: "assistant",
          content: metaText,
          kind: "chat",
        });
        outcome.placeholderMessageId = pushMessage(svc, {
          role: "assistant",
          content: JSON.stringify({ called, args }, null, 2),
          kind: "tool_request",
          name: called,
          args,
          meta,
          parentId: outcome.userMessageId,
        });
      } else {
        updateMessage(svc, outcome.placeholderMessageId, {
          role: "assistant",
          content: JSON.stringify({ called, args }, null, 2),
          kind: "tool_request",
          name: called,
          args,
        });
      }

      // Respect executed_result if your backend returns it embedded
      if (Object.prototype.hasOwnProperty.call(js, "executed_result")) {
        outcome.executed = true;
        outcome.executedResult = js.executed_result;
      } else if (svc.state.mode === "run") {
        const res = await svc.confirmToolRequest(outcome.placeholderMessageId);
        outcome.executed = true;
        outcome.executedResult = res;
      } else if (svc.state.autoExecute) {
        const res = await svc.confirmToolRequest(outcome.placeholderMessageId);
        outcome.executed = true;
        outcome.executedResult = res;
      }
    }

    outcome.ok = true;
  } catch (e) {
    svc.log("submit error", e);
    updateMessage(svc, outcome.placeholderMessageId, {
      role: "assistant",
      content: `⚠️ ${e}`,
      kind: "chat",
    });
    outcome.ok = false;
    outcome.error = String(e?.message || e);
  } finally {
    svc.set({ loading: false });
  }

  return outcome; // ← single, final return
}
