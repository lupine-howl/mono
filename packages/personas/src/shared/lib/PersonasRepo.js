// personas-repo.js
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@loki/db/util";

export class PersonasRepo {
  constructor({ table = "personas", primaryKey = "id" } = {}) {
    this.table = table;
    this.primaryKey = primaryKey;
  }

  async list() {
    const r = await dbSelect({
      table: this.table,
      where: {},
      limit: 1000,
      offset: 0,
      orderBy: '"createdAt" DESC',
    });
    const rows = Array.isArray(r?.items) ? r.items : [];
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return rows;
  }

  async insert(values) {
    return (await dbInsert({ table: this.table, values }))?.item ?? null;
  }

  async update(id, patch) {
    return (await dbUpdate({ table: this.table, id, patch }))?.item ?? null;
  }

  async remove(id) {
    await dbDelete({ table: this.table, id });
  }
}
