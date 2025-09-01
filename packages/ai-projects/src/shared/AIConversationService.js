// ai-chat-conversation-service.js
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@loki/db/util";
import { getGlobalSingleton } from "@loki/utilities";
import { aiChatService as defaultChatService } from "@loki/ai-chat/util";

export class AIConversationService extends EventTarget {
  constructor({
    table = "Conversations",
    messagesTable = "Messages",
    primaryKey = "id",
    chatService = defaultChatService,
    projectService = null,
    projectId = null,
    storageKey = "conversation:selectedId",
  } = {}) {
    super();
    this.table = table;
    this.messagesTable = messagesTable;
    this.primaryKey = primaryKey;

    this.chatService = chatService || defaultChatService;
    this.projectService = projectService;

    this.storageKey = storageKey;

    this.projectId = projectId; // scope filter
    this.conversations = [];
    this.selectedId = localStorage.getItem(this.storageKey) || null;

    this._ready = this.sync();
  }

  async ready() {
    await this._ready;
  }

  _emit(detail = {}) {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: {
          projectId: this.projectId,
          conversations: this.conversations,
          selectedId: this.selectedId,
          ...detail,
        },
      })
    );
  }

  get selected() {
    return this.conversations.find((c) => c.id === this.selectedId) || null;
  }

  setChatService(chatService) {
    // Allow override but default back to the singleton
    this.chatService = chatService || defaultChatService;
    if (this.chatService?.setConversationId && this.selectedId) {
      this.chatService.setConversationId(this.selectedId);
      this.chatService.syncMessages?.();
    }
  }

  setProjectService(projectService) {
    this.projectService = projectService || null;
  }

  // ---- Project scoping -----------------------------------------------------

  setProjectId(id) {
    if (id === this.projectId) return;
    this.projectId = id || null;
    // Reset selection for new scope
    // /this.selectedId = null;
    this.sync(); // refresh list + pick first
    this._emit({ type: "project:change", projectId: this.projectId });
  }

  // ---- CRUD + selection ----------------------------------------------------

  async sync() {
    try {
      const where = this.projectId ? { projectId: this.projectId } : {};
      const r = await dbSelect({
        table: this.table,
        where,
        limit: 1000,
        offset: 0,
        orderBy: `"lastMessageAt" DESC, "updatedAt" DESC, "createdAt" DESC`,
      });
      const list = Array.isArray(r?.items) ? r.items : [];
      this.conversations = list;

      // Ensure selectedId is valid within current scope
      if (
        !this.selectedId ||
        !this.conversations.some((c) => c.id === this.selectedId)
      ) {
        this.selectedId = this.conversations[0]?.id || null;
      }

      // Prime chat service on first load / scope change
      if (this.chatService?.setConversationId && this.selectedId) {
        this.chatService.setConversationId(this.selectedId);
        this.chatService.syncMessages?.();
      }
    } finally {
      this._emit({ type: "sync" });
    }
  }

  select(id) {
    if (!id || id === this.selectedId) return;

    // If projectId is active, ignore selects outside scope (defensive)
    if (this.projectId) {
      const c = this.conversations.find((x) => x.id === id);
      if (!c) return; // not in current scope
    }

    this.selectedId = id;
    localStorage.setItem(this.storageKey, id);

    if (this?.chatService?.setConversationId) {
      this.chatService.setConversationId(id);
      this.chatService.syncMessages?.();
    }

    this._emit({ type: "select", id });
  }

  async create(name = "New chat") {
    const now = Date.now();
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Math.random().toString(36).slice(2)}-${now.toString(36)}`;

    const row = {
      id,
      projectId: this.projectId ?? null,
      name: String(name || "New chat").trim(),
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      meta: null,
    };

    // optimistic add + select
    this.conversations = [row, ...this.conversations];
    this.selectedId = row.id;
    this._emit({ type: "create:local", conversation: row });

    // prime chat immediately
    if (this.chatService?.setConversationId) {
      this.chatService.setConversationId(row.id);
      this.chatService.syncMessages?.();
    }

    try {
      const r = await dbInsert({ table: this.table, values: row });
      if (r?.item) {
        this.conversations = [
          r.item,
          ...this.conversations.filter((c) => c.id !== row.id),
        ];
        this._emit({ type: "create:server", conversation: r.item });

        if (
          this.selectedId === r.item.id &&
          this.chatService?.setConversationId
        ) {
          this.chatService.setConversationId(r.item.id);
          this.chatService.syncMessages?.();
        }
      } else {
        throw new Error("dbInsert returned no item");
      }
    } catch (e) {
      // revert
      this.conversations = this.conversations.filter((c) => c.id !== row.id);
      this.selectedId = this.conversations[0]?.id || null;
      this._emit({ type: "create:revert", error: String(e) });

      if (this.chatService?.setConversationId && this.selectedId) {
        this.chatService.setConversationId(this.selectedId);
        this.chatService.syncMessages?.();
      }
    }

    return this.selectedId;
  }

  async rename(id, name) {
    const idx = this.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return;

    const patch = {
      name: String(name || "").trim() || "Untitled",
      updatedAt: Date.now(),
    };
    const prev = this.conversations[idx];

    // optimistic rename
    this.conversations = [...this.conversations];
    this.conversations[idx] = { ...prev, ...patch };
    this._emit({ type: "rename:local", id, name: patch.name });

    try {
      const r = await dbUpdate({ table: this.table, id, patch });
      if (r?.item) this.conversations[idx] = r.item;
      else throw new Error("dbUpdate returned no item");
    } catch {
      await this.sync(); // resync on failure
    }
  }

  async moveToProject(conversationId, newProjectId) {
    const idx = this.conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return;

    const patch = { projectId: newProjectId ?? null, updatedAt: Date.now() };
    const prev = this.conversations[idx];

    // optimistic local change (may disappear from current scope after sync)
    this.conversations = [...this.conversations];
    this.conversations[idx] = { ...prev, ...patch };
    this._emit({
      type: "move:local",
      id: conversationId,
      projectId: newProjectId,
    });

    try {
      await dbUpdate({ table: this.table, id: conversationId, patch });
    } finally {
      // re-sync to respect current scope filter
      await this.sync();
    }
  }

  async remove(id) {
    const prev = this.conversations;
    const wasSelected = this.selectedId === id;

    // optimistic remove
    this.conversations = prev.filter((c) => c.id !== id);
    if (wasSelected) this.selectedId = this.conversations[0]?.id || null;
    this._emit({ type: "remove:local", id });

    try {
      await dbDelete({ table: this.table, id });

      if (
        wasSelected &&
        this.selectedId &&
        this.chatService?.setConversationId
      ) {
        this.chatService.setConversationId(this.selectedId);
        this.chatService.syncMessages?.();
      }
    } catch {
      this.conversations = prev; // revert
      this._emit({ type: "remove:revert", id });
      await this.sync();
    }
  }

  // ---- Messages helpers ----------------------------------------------------

  /** Clear all messages in a conversation (safe loop with pagination). */
  async clearMessages(conversationId) {
    if (!conversationId) return;

    const limit = 500;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = await dbSelect({
        table: this.messagesTable,
        where: { conversationId },
        limit,
        offset: 0,
      });
      const items = Array.isArray(r?.items) ? r.items : [];
      if (!items.length) break;
      for (const row of items) {
        if (row?.id) await dbDelete({ table: this.messagesTable, id: row.id });
      }
    }

    // If we’re looking at that conversation, refresh the chat view.
    if (this.chatService?.get?.().conversationId === conversationId) {
      await this.chatService.syncMessages?.();
    }
  }

  /** Call after each user/assistant message to bump activity + maybe rename. */
  async touch(id, { nameFromText = null } = {}) {
    if (!id) return;
    const now = Date.now();
    const idx = this.conversations.findIndex((c) => c.id === id);
    const local = idx >= 0 ? this.conversations[idx] : null;

    const patch = {
      updatedAt: now,
      lastMessageAt: now,
      ...(nameFromText && (!local?.name || local.name === "New chat")
        ? { name: nameFromText }
        : {}),
    };

    if (local) {
      this.conversations = [...this.conversations];
      this.conversations[idx] = { ...local, ...patch };
      this._emit({ type: "touch:local", id });
    }

    try {
      await dbUpdate({ table: this.table, id, patch });
    } catch {}

    // Also bump the project, if known
    const projectId = local?.projectId ?? this.projectId ?? null;
    if (projectId && this.projectService?.touch) {
      this.projectService.touch(projectId);
    }
  }
}

// ---- singleton helpers ----
export function getAIConversationService(opts = {}) {
  const KEY = Symbol.for("@loki/ai-chat:conversation-service@1");
  return getGlobalSingleton(KEY, () => new AIConversationService(opts));
}
export const aiConversationService = getAIConversationService();
