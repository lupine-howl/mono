import { fs, path } from "@loki/utilities";

export class MemoryStore {
  constructor() {
    /** @type {Map<string, CacheItem>} */ this.byKey = new Map(); // exact
    /** @type {Map<string, CacheItem>} */ this.byId = new Map(); // all
    /** @type {string[]} */ this.lru = []; // most recent at end
  }
  getByKey(key) {
    return this.byKey.get(key) || null;
  }
  put(item) {
    this.byId.set(item.id, item);
    this.byKey.set(item.key, item);
    this.touch(item.id);
  }
  touch(id) {
    const idx = this.lru.indexOf(id);
    if (idx !== -1) this.lru.splice(idx, 1);
    this.lru.push(id);
  }
  *items() {
    // iterator for scan
    for (const id of this.lru) yield this.byId.get(id);
  }
  delete(id) {
    const item = this.byId.get(id);
    if (!item) return;
    this.byId.delete(id);
    this.byKey.delete(item.key);
    const i = this.lru.indexOf(id);
    if (i !== -1) this.lru.splice(i, 1);
  }
  size() {
    return this.byId.size;
  }
  evictLeastRecent(n = 1) {
    for (let i = 0; i < n; i++) {
      const id = this.lru.shift();
      if (!id) break;
      this.delete(id);
    }
  }
}

function ensureDirSync(p) {
  fs.mkdirSync(p, { recursive: true });
}

function atomicWriteFileSync(file, data) {
  const dir = path.dirname(file);
  ensureDirSync(dir);
  const tmp = path.join(dir, `.${path.basename(file)}.tmp`);
  fs.writeFileSync(tmp, data, "utf8");
  // rename is atomic on POSIX
  fs.renameSync(tmp, file);
}

export class FileStore {
  /**
   * @param {object} opts
   * @param {string} opts.file - Path to JSON file
   * @param {number} [opts.autosaveMs=250] - Debounce saves (0 = save every call)
   */
  constructor({
    file = process?.cwd() + "/data/cache.json",
    autosaveMs = 250,
  } = {}) {
    if (!file) throw new Error("FileStore requires { file }");
    console.log(file);
    this.file = file;
    this.autosaveMs = autosaveMs;

    /** @type {Map<string, CacheItem>} */ this.byKey = new Map();
    /** @type {Map<string, CacheItem>} */ this.byId = new Map();
    /** @type {string[]} */ this.lru = [];

    this._timer = null;
    this._loadSync();

    // Try to persist on exit (best-effort)
    const save = () => this._saveSync();
    process.once?.("beforeExit", save);
    process.once?.("SIGINT", () => {
      save();
      process.exit(0);
    });
    process.once?.("SIGTERM", () => {
      save();
      process.exit(0);
    });
  }

  // ---- public API (same as MemoryStore) ------------------------------------

  getByKey(key) {
    return this.byKey.get(key) || null;
  }

  put(item) {
    this.byId.set(item.id, item);
    this.byKey.set(item.key, item);
    this.touch(item.id);
    this._scheduleSave();
  }

  touch(id) {
    const idx = this.lru.indexOf(id);
    if (idx !== -1) this.lru.splice(idx, 1);
    this.lru.push(id);
    this._scheduleSave();
  }

  *items() {
    for (const id of this.lru) yield this.byId.get(id);
  }

  delete(id) {
    const item = this.byId.get(id);
    if (!item) return;
    this.byId.delete(id);
    // Only clear byKey if it points to this item
    const current = this.byKey.get(item.key);
    if (current?.id === id) this.byKey.delete(item.key);
    const i = this.lru.indexOf(id);
    if (i !== -1) this.lru.splice(i, 1);
    this._scheduleSave();
  }

  size() {
    return this.byId.size;
  }

  evictLeastRecent(n = 1) {
    for (let i = 0; i < n; i++) {
      const id = this.lru.shift();
      if (!id) break;
      this.delete(id);
    }
  }

  /** Force an immediate save. */
  flush() {
    this._saveSync();
  }

  // ---- internals ------------------------------------------------------------

  _loadSync() {
    try {
      const text = fs.readFileSync(this.file, "utf8");
      const data = JSON.parse(text);

      // data format: { v:1, items:[...], lru:[...] }
      const items = Array.isArray(data?.items) ? data.items : [];
      const lru = Array.isArray(data?.lru) ? data.lru : [];

      this.byId.clear();
      this.byKey.clear();
      this.lru = [];

      for (const it of items) {
        if (!it?.id || !it?.key) continue;
        this.byId.set(it.id, it);
        // latest wins for duplicate keys
        this.byKey.set(it.key, it);
      }

      // rebuild LRU using saved order but skip missing ids
      for (const id of lru) {
        if (this.byId.has(id)) this.lru.push(id);
      }
      // include any items not present in saved LRU at the end
      for (const id of this.byId.keys()) {
        if (!this.lru.includes(id)) this.lru.push(id);
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        // Corrupt file: back it up and start fresh
        try {
          const bak = `${this.file}.corrupt-${Date.now()}.bak`;
          fs.copyFileSync(this.file, bak);
        } catch {}
      }
      // Start empty
      this.byId.clear();
      this.byKey.clear();
      this.lru = [];
      // First save will create the file
      this._scheduleSave();
    }
  }

  _serialize() {
    // Convert maps to arrays; assume `result` is JSON-serializable.
    const items = Array.from(this.byId.values());
    return JSON.stringify({ v: 1, items, lru: this.lru }, null, 0);
  }

  _saveSync() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const data = this._serialize();
    atomicWriteFileSync(this.file, data);
  }

  _scheduleSave() {
    if (this.autosaveMs === 0) {
      this._saveSync();
      return;
    }
    if (this._timer) return;
    this._timer = setTimeout(() => this._saveSync(), this.autosaveMs);
  }
}
