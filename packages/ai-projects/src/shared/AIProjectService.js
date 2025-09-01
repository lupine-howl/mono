// @loki/ai-core/src/services/ai-project-service.js
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@loki/db/util";
import { getGlobalSingleton } from "@loki/utilities";

// Singletons
import { aiConversationService } from "./AIConversationService.js";
import { aiChatService } from "@loki/ai-chat/util";

/**
 * Projects encapsulate multiple conversations.
 * DB is the source of truth for model/persona/customInstructions/attachments.
 * - On select: copy project fields → chat context.
 * - On updating the currently selected project: reflect changes → chat context.
 * - Conversations are scoped by selected project.
 */
export class AIProjectService extends EventTarget {
  constructor({
    table = "Projects",
    conversationsTable = "Conversations",
    messagesTable = "Messages",
    primaryKey = "id",
    conversationService = null, // optional override (defaults to singleton)
    chatService = null, // optional override (defaults to singleton)
  } = {}) {
    super();

    this.table = table;
    this.conversationsTable = conversationsTable;
    this.messagesTable = messagesTable;
    this.primaryKey = primaryKey;

    this.conversationService = conversationService || aiConversationService;
    this.chatService = chatService || aiChatService;

    this.projects = [];
    this.selectedId = localStorage.getItem("project:selectedId");

    // Guard: when pushing project → chat, don't feed it back.
    this._applyingFromProject = false;

    this._ready = this.sync();
  }

  async ready() {
    await this._ready;
  }

  _emit(detail = {}) {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: {
          projects: this.projects,
          selectedId: this.selectedId,
          ...detail,
        },
      })
    );
  }

  get selected() {
    return this.projects.find((p) => p.id === this.selectedId) || null;
  }

  // ---------- Sync ----------
  async sync() {
    try {
      const r = await dbSelect({
        table: this.table,
        where: {},
        limit: 1000,
        offset: 0,
        orderBy:
          `"archived" ASC, "orderIndex" ASC, ` +
          `"lastActivityAt" DESC, "updatedAt" DESC, "createdAt" DESC`,
      });

      // Normalize everything coming from DB
      this.projects = this._normalizeList(r?.items);

      if (!this.selectedId && this.projects[0]) {
        this.selectedId = this.projects[0].id;
      }

      // Scope conversations to active project
      if (this.selectedId && this.conversationService?.setProjectId) {
        this.conversationService.setProjectId(this.selectedId);
        this.conversationService.sync?.();
      }

      // Apply project fields to chat on first load
      if (this.selectedId) {
        this.#applyProjectFieldsToChat(this.selected);
      }
    } finally {
      this._emit({ type: "sync" });
    }
  }

  // ---------- Selection ----------
  select(id) {
    if (!id || id === this.selectedId) return;
    this.selectedId = id;
    localStorage.setItem("project:selectedId", id);

    // Scope conversations (one-way)
    if (this.conversationService?.setProjectId) {
      this.conversationService.setProjectId(id);
      this.conversationService.sync?.();
    }

    // Apply current project → chat (selected is already normalized via sync)
    this.#applyProjectFieldsToChat(this.selected);

    this._emit({ type: "select", id });
  }

  // ---------- CRUD ----------
  async create(name = "New project") {
    const now = Date.now();

    // Seed from current chat (normalize attachments)
    const chat = this.chatService?.get?.() || {};
    const row = this._normalizeRow({
      id: crypto.randomUUID(),
      name: String(name || "New project").trim(),
      description: null,

      // Project-level fields that are the DB truth:
      model: chat.model ?? null,
      persona: chat.persona ?? null,
      customInstructions: chat.customInstructions ?? null,
      attachments: this._normalizeAttachments(chat.attachments),

      archived: null,
      orderIndex: null,
      meta: null,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: null,
    });

    // optimistic add + select
    this.projects = [row, ...this.projects];
    this.selectedId = row.id;
    this._emit({ type: "create:local", project: row });

    // Hint conversations scope
    if (this.conversationService?.setProjectId) {
      this.conversationService.setProjectId(row.id);
      this.conversationService.sync?.();
    }

    // Immediately reflect to chat (we selected it)
    this.#applyProjectFieldsToChat(row);

    try {
      const r = await dbInsert({ table: this.table, values: row });
      if (r?.item) {
        const item = this._normalizeRow(r.item);
        this.projects = [item, ...this.projects.filter((p) => p.id !== row.id)];
        this._emit({ type: "create:server", project: item });

        // Ensure chat still mirrors the saved row
        if (this.selectedId === item.id) {
          this.#applyProjectFieldsToChat(item);
        }
      } else {
        throw new Error("dbInsert returned no item");
      }
    } catch (e) {
      // revert
      this.projects = this.projects.filter((p) => p.id !== row.id);
      this.selectedId = this.projects[0]?.id || null;
      this._emit({ type: "create:revert", error: String(e) });

      if (this.selectedId && this.conversationService?.setProjectId) {
        this.conversationService.setProjectId(this.selectedId);
        this.conversationService.sync?.();
      }

      // Mirror fallback selection to chat
      if (this.selectedId) this.#applyProjectFieldsToChat(this.selected);
    }

    return this.selectedId;
  }

  async update(id, patch = {}) {
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx === -1) return;

    const clean = { ...patch, updatedAt: Date.now() };
    if ("attachments" in clean) {
      clean.attachments = this._normalizeAttachments(clean.attachments);
    }

    // optimistic local update (normalized)
    const prev = this.projects[idx];
    const next = this._normalizeRow({ ...prev, ...clean });
    this.projects = [...this.projects];
    this.projects[idx] = next;
    this._emit({ type: "update:local", id, patch: clean });

    // If updating selected project & touching chat fields → reflect now
    if (id === this.selectedId && this.#hasChatFields(clean)) {
      this.#applyProjectFieldsToChat(next);
    }

    try {
      const r = await dbUpdate({ table: this.table, id, patch: clean });
      if (r?.item) {
        const item = this._normalizeRow(r.item);
        this.projects[idx] = item;

        // After server ack, mirror again (authoritative row)
        if (id === this.selectedId && this.#hasChatFields(clean)) {
          this.#applyProjectFieldsToChat(item);
        }
      } else {
        throw new Error("dbUpdate returned no item");
      }
    } catch {
      await this.sync(); // resync on failure
    }
  }

  async rename(id, name) {
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const patch = {
      name: String(name || "").trim() || "Untitled",
      updatedAt: Date.now(),
    };

    const prev = this.projects[idx];
    this.projects = [...this.projects];
    this.projects[idx] = { ...prev, ...patch };
    this._emit({ type: "rename:local", id, name: patch.name });

    try {
      const r = await dbUpdate({ table: this.table, id, patch });
      if (r?.item) this.projects[idx] = this._normalizeRow(r.item);
      else throw new Error("dbUpdate returned no item");
    } catch {
      await this.sync();
    }
  }

  async archive(id, archived = true) {
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const patch = { archived: !!archived, updatedAt: Date.now() };

    const prev = this.projects[idx];
    this.projects = [...this.projects];
    this.projects[idx] = { ...prev, ...patch };
    this._emit({ type: "archive:local", id, archived: !!archived });

    try {
      await dbUpdate({ table: this.table, id, patch });
    } catch {
      await this.sync();
    }
  }

  // ---------- Normalizers ----------
  _normalizeAttachments(val) {
    if (val == null) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const v = JSON.parse(val);
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    }
    return [];
  }
  _normalizeRow(row) {
    if (!row || typeof row !== "object") return row;
    return {
      ...row,
      attachments: this._normalizeAttachments(row.attachments),
    };
  }
  _normalizeList(list) {
    return Array.isArray(list) ? list.map((r) => this._normalizeRow(r)) : [];
  }

  async remove(id, { cascade = true } = {}) {
    const prev = this.projects;
    const wasSelected = this.selectedId === id;

    // optimistic remove
    this.projects = prev.filter((p) => p.id !== id);
    if (wasSelected) this.selectedId = this.projects[0]?.id || null;
    this._emit({ type: "remove:local", id });

    try {
      if (cascade) {
        await this.#deleteConversationsAndMessages(id);
      }
      await dbDelete({ table: this.table, id });

      // If selection changed, re-scope and mirror new selection to chat
      if (wasSelected && this.selectedId) {
        if (this.conversationService?.setProjectId) {
          this.conversationService.setProjectId(this.selectedId);
          this.conversationService.sync?.();
        }
        this.#applyProjectFieldsToChat(this.selected);
      }
    } catch (e) {
      // revert + resync
      this.projects = prev;
      this._emit({ type: "remove:revert", id, error: String(e) });
      await this.sync();
    }
  }

  // ---------- Bulk helpers ----------
  async clearProject(projectId) {
    if (!projectId) return;
    await this.#deleteConversationsAndMessages(projectId);
    if (
      this.conversationService?.setProjectId &&
      this.selectedId === projectId
    ) {
      this.conversationService.setProjectId(projectId);
      this.conversationService.sync?.();
    }
    this._emit({ type: "clear:project", id: projectId });
  }

  async touch(projectId) {
    if (!projectId) return;
    const idx = this.projects.findIndex((p) => p.id === projectId);
    const now = Date.now();
    if (idx >= 0) {
      this.projects = [...this.projects];
      this.projects[idx] = {
        ...this.projects[idx],
        lastActivityAt: now,
        updatedAt: now,
      };
      this._emit({ type: "touch:local", id: projectId });
    }
    try {
      await dbUpdate({
        table: this.table,
        id: projectId,
        patch: { lastActivityAt: now, updatedAt: now },
      });
    } catch {}
  }

  // ---------- Private: project → chat mirroring ----------
  #hasChatFields(patch) {
    if (!patch || typeof patch !== "object") return false;
    return (
      "model" in patch ||
      "persona" in patch ||
      "customInstructions" in patch ||
      "attachments" in patch
    );
  }

  #applyProjectFieldsToChat(project) {
    if (!project || !this.chatService) return;
    const att = this._normalizeAttachments(project.attachments);

    this._applyingFromProject = true;
    try {
      if (project.model != null) this.chatService.setModel?.(project.model);
      if (project.persona != null)
        this.chatService.setPersona?.(project.persona);
      if (project.customInstructions != null)
        this.chatService.setCustomInstructions?.(project.customInstructions);
      this.chatService.setAttachments?.(att);
    } finally {
      queueMicrotask(() => {
        this._applyingFromProject = false;
      });
    }
  }

  async #deleteConversationsAndMessages(projectId) {
    const limit = 500;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = await dbSelect({
        table: this.conversationsTable,
        where: { projectId },
        limit,
        offset: 0,
        orderBy: null,
      });
      const convs = Array.isArray(r?.items) ? r.items : [];
      if (!convs.length) break;

      for (const c of convs) {
        // delete messages for conversation c.id
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const mr = await dbSelect({
            table: this.messagesTable,
            where: { conversationId: c.id },
            limit,
            offset: 0,
            orderBy: null,
          });
          const msgs = Array.isArray(mr?.items) ? mr.items : [];
          if (!msgs.length) break;
          for (const m of msgs) {
            if (m?.id) await dbDelete({ table: this.messagesTable, id: m.id });
          }
        }
        if (c?.id) await dbDelete({ table: this.conversationsTable, id: c.id });
      }
    }
  }
}

// ---- Singleton helpers ----
export function getAIProjectService(opts = {}) {
  const KEY = Symbol.for("@loki/ai-core:project-service@1");
  return getGlobalSingleton(KEY, () => new AIProjectService(opts));
}
export const aiProjectService = getAIProjectService();
