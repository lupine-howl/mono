// personas-controller.js
import { BaseCollectionController } from "@loki/layout/util";
import { PersonasRepo } from "./PersonasRepo.js";

export class PersonasController extends BaseCollectionController {
  constructor({
    table = "personas",
    primaryKey = "id",
    eventName = "personas:change",
    hub = null,
    repo,
  } = {}) {
    super({
      primaryKey,
      eventName,
      hub,
      repo: repo || new PersonasRepo({ table, primaryKey }),
      // (optional) sort by createdAt desc; your repo already sorts but this is a safe default
      sortItems: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    });
  }

  toInsert(partial = {}) {
    const now = Date.now();
    return {
      [this.primaryKey]: this._uuid(),
      name: (partial.name ?? "Untitled Persona").trim(),
      description: (partial.description ?? "").trim(),
      model: partial.model ?? "gpt-5.1-mini",
      persona: partial.persona ?? "",
      createdAt: now,
      updatedAt: now,
    };
  }

  normalizeFromServer(item) {
    // If backend adds/renames fields, normalize here
    return item;
  }

  makeSeed() {
    const now = Date.now();
    return {
      [this.primaryKey]: this._uuid(),
      name: "Default Researcher",
      description: "Careful web-savvy researcher persona for GPTs.",
      model: "gpt-5.1-mini",
      persona: "You are a careful, concise web researcher.",
      createdAt: now,
      updatedAt: now,
    };
  }
}
