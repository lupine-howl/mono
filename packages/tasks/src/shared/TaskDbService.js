// DB-only service for tasks (stateless)
import { dbDelete, dbInsert, dbSelect, dbUpdate } from "@loki/db/util";

export class TaskDbService {
  constructor({ table = "tasks", primaryKey = "id" } = {}) {
    this.table = table;
    this.pk = primaryKey;
  }

  list({ limit = 1000, offset = 0 } = {}) {
    return dbSelect({
      table: this.table,
      where: {},
      limit,
      offset,
      orderBy: `"createdAt" DESC`,
    });
  }

  insert(values) {
    return dbInsert({ table: this.table, values });
  }

  update(id, patch) {
    return dbUpdate({ table: this.table, id, patch });
  }

  delete(id) {
    return dbDelete({ table: this.table, id });
  }
}
