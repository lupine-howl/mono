// fs/service.js
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeEnsureWs } from "./safety.js";
import { statSafe, walkTreeConcurrent } from "./utils.js";
import { getGlobalSingleton } from "@loki/utilities";

const DEFAULT_WS_SCAN_IGNORES = [
  "node_modules",
  "dist",
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".cache",
  ".turbo",
  ".pnpm",
  ".yarn",
  ".gradle",
  "build",
  "out",
  "coverage",
  "target",
  ".venv",
  "venv",
  "__pycache__",
];

export const WorkspaceStore = getGlobalSingleton(
  Symbol.for("fs.WorkspaceStore"),
  () => {
    const state = {
      root:
        process.env.WS_ROOT ||
        process.env.WORKSPACES_ROOT ||
        path.resolve(process.cwd(), "../../"),
      staticWorkspaces: null, // optional: { id: { name,path,readOnly } }
      preferShallow: undefined, // auto by default
      shallowDepth: 3,
      concurrency: 8,
      ttlMs: 30_000,
      maxFiles: 20_000,
      maxDepth: 6,
      includeHidden: false,
      extraIgnores: [],
      // cache
      cacheAt: 0,
      cacheBase: null,
      results: null, // Map<string, wsObj>
      promise: null,
      ensureStatic: null, // set if staticWorkspaces provided
    };

    const summarizePkg = (pkg) => ({
      name: pkg?.name,
      version: pkg?.version,
      private: !!pkg?.private,
      type: pkg?.type,
      description: pkg?.description,
      dependencies: Object.keys(pkg?.dependencies || {}).length,
      devDependencies: Object.keys(pkg?.devDependencies || {}).length,
      scripts: Object.keys(pkg?.scripts || {}).length,
    });

    function configure({
      root,
      workspaces, // optional static map { id: {name, path, readOnly} }
      preferShallow,
      shallowDepth,
      ttlMs,
      extraIgnores,
      includeHidden,
      maxDepth,
      maxFiles,
      concurrency,
    } = {}) {
      if (root) state.root = path.resolve(root);
      if (workspaces && typeof workspaces === "object") {
        state.staticWorkspaces = { ...workspaces };
        state.ensureStatic = makeEnsureWs(state.staticWorkspaces);
      }
      if (preferShallow !== undefined) state.preferShallow = preferShallow;
      if (shallowDepth != null) state.shallowDepth = shallowDepth;
      if (ttlMs != null) state.ttlMs = ttlMs;
      if (Array.isArray(extraIgnores))
        state.extraIgnores = extraIgnores.slice();
      if (includeHidden != null) state.includeHidden = !!includeHidden;
      if (maxDepth != null) state.maxDepth = maxDepth;
      if (maxFiles != null) state.maxFiles = maxFiles;
      if (concurrency != null) state.concurrency = concurrency;
      invalidate();
    }

    function invalidate() {
      state.cacheAt = 0;
      state.cacheBase = null;
      state.results = null;
      state.promise = null;
    }

    async function pickExistingRoot() {
      const root = path.resolve(state.root);
      const st = await statSafe(root);
      if (st?.isDirectory()) return root;
      throw new Error(`Workspace root not found: ${root}`);
    }

    async function scanLimitedDepth(base, levels) {
      const results = new Map();
      const ignoreSet = new Set([
        ...DEFAULT_WS_SCAN_IGNORES,
        ...state.extraIgnores,
      ]);
      const queue = [{ rel: ".", abs: base, depth: 0 }];
      const seen = new Set();

      while (queue.length) {
        const { rel, abs, depth } = queue.shift();
        if (seen.has(abs)) continue;
        seen.add(abs);

        try {
          const txt = await fs.readFile(path.join(abs, "package.json"), "utf8");
          const pkg = JSON.parse(txt);
          const id = rel === "." ? "." : rel.replace(/^[.\/]+/, "");
          const name = pkg?.name || id || path.posix.basename(abs);
          const wsObj = {
            id,
            name,
            path: abs,
            readOnly: false,
            meta: summarizePkg(pkg),
          };
          if (!results.has(id)) results.set(id, wsObj);
          if (pkg?.name && !results.has(pkg.name)) results.set(pkg.name, wsObj);
        } catch {
          // no package.json here — ok
        }

        if (depth >= levels) continue;
        const entries = await fs.readdir(abs, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const name = ent.name;
          if (!state.includeHidden && name.startsWith(".")) continue;
          if (ignoreSet.has(name)) continue;
          const childAbs = path.join(abs, name);
          const childRel = rel === "." ? name : path.posix.join(rel, name);
          queue.push({ rel: childRel, abs: childAbs, depth: depth + 1 });
        }
      }
      return results;
    }

    async function scanDeep(base) {
      const results = new Map();
      const start = Date.now();
      const ignoreSet = new Set([
        ...DEFAULT_WS_SCAN_IGNORES,
        ...state.extraIgnores,
      ]);

      const stop = () =>
        Date.now() - start > state.ttlMs || results.size >= state.maxFiles;
      const depthOf = (rel) =>
        !rel || rel === "." ? 0 : rel.split("/").length - 1;

      await walkTreeConcurrent(base, ".", {
        includeHidden: state.includeHidden,
        concurrency: state.concurrency,
        followSymlinks: false,
        stop,
        shouldSkip: (name, relPath, isDir) => {
          if (depthOf(relPath) > state.maxDepth) return true;
          if (!state.includeHidden && name.startsWith(".")) return true;
          if (isDir && ignoreSet.has(name)) return true;
          return false;
        },
        async onDir() {},
        async onFile(abs, relPath) {
          if (path.posix.basename(relPath) !== "package.json") return;
          const dirRel = path.posix.dirname(relPath);
          const dirAbs = path.join(base, dirRel);
          try {
            const txt = await fs.readFile(abs, "utf8");
            const pkg = JSON.parse(txt);
            const pkgName = pkg?.name;
            const wsObj = {
              id: dirRel,
              name: pkgName || path.posix.basename(dirRel),
              path: dirAbs,
              readOnly: false,
              meta: summarizePkg(pkg),
            };
            if (!results.has(dirRel)) results.set(dirRel, wsObj);
            if (pkgName && !results.has(pkgName)) results.set(pkgName, wsObj);
          } catch {}
        },
      });

      return results;
    }

    async function scanDynamicWorkspaces() {
      const base = await pickExistingRoot();
      const now = Date.now();

      if (
        state.results &&
        state.cacheBase === base &&
        now - state.cacheAt < state.ttlMs
      ) {
        return { base, results: state.results };
      }
      if (state.promise && state.cacheBase === base) return state.promise;

      // decide shallow vs deep
      const baseHasPkg = !!(await statSafe(path.join(base, "package.json")));
      let shallowLevels;
      if (typeof state.preferShallow === "number") {
        shallowLevels = Math.max(0, state.preferShallow);
      } else if (state.preferShallow === true) {
        shallowLevels = state.shallowDepth;
      } else if (state.preferShallow === false) {
        shallowLevels = 0;
      } else {
        shallowLevels =
          path.basename(base) === "packages" || !baseHasPkg
            ? state.shallowDepth
            : 0;
      }

      state.cacheBase = base;
      state.promise = (async () => {
        let results;
        if (shallowLevels > 0) {
          results = await scanLimitedDepth(base, shallowLevels);
          if (results.size === 0) results = await scanDeep(base);
        } else {
          results = await scanDeep(base);
        }
        state.cacheAt = Date.now();
        state.results = results;
        state.promise = null;
        return { base, results };
      })();

      return state.promise;
    }

    async function ensureWs(id) {
      // static?
      if (state.ensureStatic) return state.ensureStatic(id);
      if (!id) throw new Error("Workspace id required");

      const { results } = await scanDynamicWorkspaces();
      const w = results.get(String(id));
      if (!w) throw new Error(`Unknown workspace: ${id}`);
      return w;
    }

    async function listWorkspaces() {
      // static → enrich with package.json if present
      if (state.ensureStatic) {
        const entries = Object.entries(state.staticWorkspaces).map(
          ([id, w]) => ({ id, ...w })
        );
        const enriched = await Promise.all(
          entries.map(async (w) => {
            try {
              const txt = await fs.readFile(
                path.join(w.path, "package.json"),
                "utf8"
              );
              const pkg = JSON.parse(txt);
              return { ...w, meta: summarizePkg(pkg) };
            } catch {
              return w;
            }
          })
        );
        return {
          workspaces: enriched.map((w) => ({
            id: w.id,
            name: w.name,
            path: w.path,
            readOnly: !!w.readOnly,
            ...(w.meta ? { meta: w.meta } : {}),
          })),
        };
      }

      // dynamic
      const { results } = await scanDynamicWorkspaces();
      const uniq = new Map();
      for (const w of results.values()) {
        if (!uniq.has(w.path)) uniq.set(w.path, w);
      }
      return {
        workspaces: Array.from(uniq.values()).map((w) => ({
          id: w.id,
          name: w.name,
          path: w.path,
          readOnly: !!w.readOnly,
          ...(w.meta ? { meta: w.meta } : {}),
        })),
      };
    }

    return {
      configure,
      invalidate,
      ensureWs,
      listWorkspaces,
      get root() {
        return state.root;
      },
    };
  }
);
