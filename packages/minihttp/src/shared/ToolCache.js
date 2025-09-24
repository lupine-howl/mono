// packages/ai-cache/src/shared/SemanticCache.js
// Tiny semantic cache with exact + near-duplicate hits using embeddings.
import { getGlobalSingleton } from "@loki/utilities";
import { FileStore as Store } from "./MemoryStore.js";

import OpenAI from "openai";
import { crypto } from "@loki/utilities";

/** @typedef {{id:string,key:string,query:string,norm:string,vec:number[],result:any,createdAt:number,expiresAt:number,lastUsed:number}} CacheItem */

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // return 8-char hex; good enough for a key
  return ("0000000" + h.toString(16)).slice(-8);
}

const DEFAULTS = {
  model: "text-embedding-3-small",
  threshold: 0.95, // cosine similarity threshold for "same intent"
  ttlMs: 60 * 60 * 1000, // 1 hour
  maxItems: 1000, // LRU cap
};

function now() {
  return Date.now();
}
function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function stableStringify(x) {
  if (x === null || x === undefined) return "";
  if (typeof x !== "object") return String(x);
  if (Array.isArray(x)) return `[${x.map(stableStringify).join(",")}]`;
  const keys = Object.keys(x).sort();
  return `{${keys
    .map((k) => JSON.stringify(k) + ":" + stableStringify(x[k]))
    .join(",")}}`;
}

function pickTextField(obj) {
  // prefer common text fields if present
  const CANDIDATES = ["prompt", "q", "query", "text", "content", "message"];
  for (const k of CANDIDATES) {
    if (typeof obj?.[k] === "string" && obj[k].trim()) return obj[k];
  }
  return null;
}

function normalizeText(input) {
  let s = "";
  if (typeof input === "string") s = input;
  else if (Array.isArray(input)) s = input.map(normalizeText).join(" ");
  else if (input && typeof input === "object")
    s = pickTextField(input) ?? stableStringify(input);
  else s = String(input ?? "");

  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
function l2normalize(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n) || 1;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
  return out;
}
function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// --- Main cache --------------------------------------------------------------
export class SemanticCache {
  /**
   * @param {object} opts
   * @param {string} [opts.apiKey]
   * @param {string} [opts.model]
   * @param {number} [opts.threshold]
   * @param {number} [opts.ttlMs]
   * @param {number} [opts.maxItems]
   * @param {{getByKey:(k:string)=>CacheItem|null, put:(item:CacheItem)=>void, touch:(id:string)=>void, items:()=>Iterable<CacheItem>, delete:(id:string)=>void, evictLeastRecent:(n?:number)=>void, size:()=>number}} [opts.store]
   */
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this.store = opts.store || new Store();
    this.openai = new OpenAI({
      apiKey: opts.apiKey || process.env.OPENAI_API_KEY,
    });
  }

  // --- public API ------------------------------------------------------------

  /**
   * Get cached result or compute + cache.
   * @template T
   * @param {string} query
   * @param {() => Promise<T>} computeFn
   * @param {{ttlMs?:number, threshold?:number, tags?:Record<string,string|number>}} [options]
   * @returns {Promise<{result:T, hit:boolean, sim?:number, cacheId?:string}>}
   */
  async getOrCompute(query, computeFn, options = {}) {
    //console.log("SemanticCache query:", query);
    const ttlMs = options.ttlMs ?? this.cfg.ttlMs;
    const threshold = options.threshold ?? this.cfg.threshold;

    const norm = normalizeText(query);
    const key = hash(norm);
    // 1) exact match
    const exact = this._fresh(this.store.getByKey(key), ttlMs);
    if (exact) {
      console.log("SemanticCache exact hit:", query);
      exact.lastUsed = now();
      this.store.touch(exact.id);
      return { result: exact.result, hit: true, sim: 1, cacheId: exact.id };
    }

    // 2) near-duplicate by embeddings
    const v = await this._embed(norm); // already l2-normalized
    const near = this._findNearest(v, ttlMs);
    console.log(threshold);
    if (near && near.bestSim >= threshold) {
      const item = near.item;
      item.lastUsed = now();
      this.store.touch(item.id);
      const ret = {
        result: item.result,
        hit: true,
        sim: near.bestSim,
        cacheId: item.id,
      };
      console.log("SemanticCache near hit:", query, "sim=", near.bestSim);
      if (options.tags) {
        // update tags on hit
        item.result = { ...item.result, ...options.tags };
        this.store.put(item);
      }
      return ret;
    }

    // 3) miss -> compute
    const result = await computeFn();

    // 4) insert
    const item = /** @type {CacheItem} */ ({
      id: crypto.randomUUID(),
      key,
      query,
      norm,
      vec: v,
      result,
      createdAt: now(),
      lastUsed: now(),
      expiresAt: now() + ttlMs,
    });
    this._evictIfNeeded();
    this.store.put(item);
    return { result, hit: false, cacheId: item.id };
  }

  /** Manually seed a cache entry (useful after offline batch). */
  async put(query, result, ttlMs = this.cfg.ttlMs) {
    const norm = normalizeText(query);
    const key = hash(norm);
    const vec = await this._embed(norm);
    const item = {
      id: crypto.randomUUID(),
      key,
      query,
      norm,
      vec,
      result,
      createdAt: now(),
      lastUsed: now(),
      expiresAt: now() + ttlMs,
    };
    this._evictIfNeeded();
    this.store.put(item);
    return item.id;
  }

  /** Clear expired items. */
  sweep() {
    const t = now();
    const remove = [];
    for (const it of this.store.items()) {
      if (it && it.expiresAt <= t) remove.push(it.id);
    }
    for (const id of remove) this.store.delete(id);
    return remove.length;
  }

  // --- internals -------------------------------------------------------------

  _evictIfNeeded() {
    const max = this.cfg.maxItems;
    const sz = this.store.size();
    if (sz >= max) this.store.evictLeastRecent(sz - max + 1);
  }

  _fresh(item, ttlMs) {
    if (!item) return null;
    if (item.expiresAt <= now()) return null;
    return item;
  }

  /**
   * @param {number[]} v  // assumed normalized
   * @param {number} ttlMs
   * @returns {{item:CacheItem, bestSim:number}|null}
   */
  _findNearest(v, ttlMs) {
    let best = null;
    let bestSim = -1;
    for (const it of this.store.items()) {
      if (!it) continue;
      const fresh = this._fresh(it, ttlMs);
      if (!fresh) continue;
      // lazy ensure vec is normalized (we store normalized already)
      const sim = cosine(v, it.vec);
      if (sim > bestSim) {
        bestSim = sim;
        best = it;
      }
    }
    return best ? { item: best, bestSim } : null;
  }

  async _embed(text) {
    const r = await this.openai.embeddings.create({
      model: this.cfg.model,
      input: text,
    });
    return l2normalize(r.data[0].embedding);
  }
}

// ---------- singleton helpers ----------
export function getSemanticCache(opts) {
  const KEY = Symbol.for("@loki/minihttp:semantic-cache@1");
  return getGlobalSingleton(KEY, () => new SemanticCache(opts));
}
export const semanticCache = getSemanticCache();
