// src/shared/services/ai-chat/deletions.js
import { dbDelete } from "@loki/db/util";

export async function deleteMessage(svc, id) {
  if (!id) return false;

  const prevLen = svc.state.messages.length;
  svc.state.messages = svc.state.messages.filter(m => m.id !== id);
  const changed = svc.state.messages.length !== prevLen;
  if (changed) svc.emit({ messages: svc.state.messages });

  if (svc.persist.enabled) {
    try {
      await dbDelete({ table: svc.persist.table, id });
    } catch (e) {
      svc.log("deleteMessage persist failed", e);
    }
  }
  return changed;
}

export async function deleteByConversationId(svc, conversationId = svc.state.conversationId) {
  if (!conversationId) return { deleted: 0 };

  const ids = svc.state.messages
    .filter(m => m.conversationId === conversationId)
    .map(m => m.id);

  if (ids.length) {
    svc.state.messages = svc.state.messages.filter(m => m.conversationId !== conversationId);
    svc.emit({ messages: svc.state.messages });
  }

  if (svc.persist.enabled) {
    try {
      await dbDelete({ table: svc.persist.table, where: { conversationId } });
    } catch (e) {
      svc.log("deleteByConversationId where-delete failed, falling back", e);
      for (const id of ids) {
        try {
          await dbDelete({ table: svc.persist.table, id });
        } catch (e2) {
          svc.log("deleteByConversationId per-id persist failed", e2);
        }
      }
    }
  }

  return { deleted: ids.length };
}

export async function deleteAllMessages(svc) {
  const ids = svc.state.messages.map(m => m.id);
  if (ids.length) {
    svc.state.messages = [];
    svc.emit({ messages: svc.state.messages });
  }

  if (svc.persist.enabled) {
    try {
      await dbDelete({ table: svc.persist.table, where: {} });
    } catch (e) {
      svc.log("deleteAllMessages table-wide delete failed, falling back", e);
      for (const id of ids) {
        try {
          await dbDelete({ table: svc.persist.table, id });
        } catch (e2) {
          svc.log("deleteAllMessages per-id persist failed", e2);
        }
      }
    }
  }

  return { deleted: ids.length };
}

export async function deleteMessagesByIds(svc, ids = []) {
  const set = new Set(ids.filter(Boolean));
  if (!set.size) return { deleted: 0 };

  const before = svc.state.messages.length;
  svc.state.messages = svc.state.messages.filter(m => !set.has(m.id));
  const deletedCount = before - svc.state.messages.length;
  if (deletedCount > 0) svc.emit({ messages: svc.state.messages });

  if (svc.persist.enabled) {
    for (const id of set) {
      try {
        await dbDelete({ table: svc.persist.table, id });
      } catch (e) {
        svc.log("deleteMessagesByIds persist failed", e);
      }
    }
  }

  return { deleted: deletedCount };
}
