// src/shared/services/ai-chat/persistence.js
import { dbSelect, dbInsert, dbUpdate } from "@loki/db/util";
import { MAX_TURNS } from "./constants.js";
import { nid } from "./helpers.js";

export function pushMessage(svc, m) {
  const now = Date.now();
  const msg = {
    id: nid(),
    t: now,
    createdAt: now,
    updatedAt: now,
    conversationId: svc.state.conversationId,
    ...m,
  };
  svc.state.messages = [...svc.state.messages, msg];
  svc.emit({ messages: svc.state.messages });

  if (svc.persist.enabled) {
    dbInsert({ table: svc.persist.table, values: msg })
      .then((r) => {
        if (r?.item) updateMessage(svc, msg.id, r.item);
      })
      .catch((e) => svc.log("persist insert failed", e));
  }
  return msg.id;
}

export function updateMessage(svc, id, patch) {
  let changed = false;
  svc.state.messages = svc.state.messages.map((m) => {
    if (m.id === id) {
      changed = true;
      return { ...m, ...patch };
    }
    return m;
  });
  if (changed) {
    svc.emit({ messages: svc.state.messages });
    if (svc.persist.enabled) {
      dbUpdate({ table: svc.persist.table, id, patch }).catch((e) =>
        svc.log("persist update failed", e)
      );
    }
  }
  return changed;
}

export async function syncMessages(svc, { limit = 1000 } = {}) {
  if (!svc.persist.enabled) return;
  try {
    const r = await dbSelect({
      table: svc.persist.table,
      where: { conversationId: svc.state.conversationId },
      limit,
      offset: 0,
      orderBy: `"createdAt" ASC, "t" ASC`,
    });
    const rows = Array.isArray(r?.items) ? r.items : [];
    rows.sort((a, b) => (a.createdAt ?? a.t ?? 0) - (b.createdAt ?? b.t ?? 0));
    svc.state.messages = rows.slice(-Math.max(MAX_TURNS * 2, 80));
    svc.emit({ messages: svc.state.messages });
  } catch (e) {
    svc.log("syncMessages failed", e);
  }
}
