// src/shared/services/ai-chat/tools.js
import { toolsService } from "@loki/minihttp/util";
import { updateMessage } from "./persistence.js";
import { findMessage, safeParse } from "./helpers.js";

export async function executeTool(svc, name, args, { refId } = {}) {
  if (!name) {
    svc.log("executeTool: missing name");
    return;
  }
  try {
    svc.set({ callingTool: true });
    const out = await toolsService.invoke(name, args);
    let kind = "tool_result";
    if (out?.messageType) kind = out.messageType;

    updateMessage(svc, refId, {
      role: "tool",
      kind,
      name,
      result: out,
      ok: true,
      ref: refId,
    });
  } catch (e) {
    updateMessage(svc, refId, {
      role: "tool",
      kind: "tool_rejected",
      rejectReason: `Tool error (${name}): ${e}`,
    });
  } finally {
    svc.set({ callingTool: false });
  }
}

export async function confirmToolRequest(svc, requestId) {
  const req = findMessage(svc, requestId);
  svc.log("confirmToolRequest", {
    requestId,
    found: !!req,
    kind: req?.kind,
  });
  if (!req || req.kind !== "tool_request") return;
  const data =
    typeof req.content === "string" ? safeParse(req.content) : req.content;

  const name =
    data?.called ||
    req.name ||
    svc.state.toolName ||
    toolsService.get()?.toolName;
  const args =
    data?.args ?? req.args ?? svc.state.toolArgs ?? toolsService.get()?.values;
  console.log(name, args);
  svc.log("confirmToolRequest → execute", { name, args });
  await executeTool(svc, name, args, { refId: requestId });
}

export function rejectToolRequest(svc, requestId, reason = "Rejected by user") {
  const req = findMessage(svc, requestId);
  svc.log("rejectToolRequest", {
    requestId,
    found: !!req,
    kind: req?.kind,
    reason,
  });
  if (!req || req.kind !== "tool_request") return;
  updateMessage(svc, requestId, {
    kind: "tool_rejected",
    rejectReason: String(reason || ""),
  });
}
