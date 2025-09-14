// fs/service.js
import sharp from "sharp";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getGlobalSingleton } from "@loki/utilities";
import {
  looksText,
  mimeFor,
  sortDirsFirst,
  DEFAULT_SNAPSHOT_IGNORES,
} from "./constants.js";
import { makeEnsureWs, safeJoin } from "./safety.js";
import {
  statSafe,
  readWithBudget,
  walkTreeConcurrent,
  makeIgnoreMatcher,
} from "./utils.js";

const DEFAULT_BUNDLE_IGNORES = ["node_modules/", "dist/"];

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

// ---------- Workspace Store (singleton) ----------
const WorkspaceStore = getGlobalSingleton(
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

// ---------- Public API (ad-hoc, no class/closure needed) ----------
export function configureFs(opts = {}) {
  WorkspaceStore.configure(opts);
}
export function invalidateFsCache() {
  WorkspaceStore.invalidate();
}

// export the resolved workspace (useful to callers that need absolute path)
export async function getWorkspace(ws) {
  return WorkspaceStore.ensureWs(ws); // { id, name, path, readOnly, meta? }
}

export async function getWorkspacePath(ws) {
  const w = await WorkspaceStore.ensureWs(ws);
  return w.path;
}

export async function fsWorkspaces() {
  return WorkspaceStore.listWorkspaces();
}

export async function fsList({ ws, rel = "." }) {
  const { path: root } = await WorkspaceStore.ensureWs(ws);
  const dir = safeJoin(root, rel);
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const items = await Promise.all(
    entries.map(async (ent) => {
      try {
        const p = path.join(dir, ent.name);
        const s = await fs.stat(p);
        return {
          name: ent.name,
          type: ent.isDirectory() ? "dir" : "file",
          size: s.size,
          mtime: s.mtimeMs,
          ext: ent.isDirectory() ? "" : path.extname(ent.name).slice(1),
        };
      } catch {
        return null;
      }
    })
  );

  return { path: rel, items: items.filter(Boolean).sort(sortDirsFirst) };
}

export async function fsRead({ ws, path: rel }) {
  const { path: root } = await WorkspaceStore.ensureWs(ws);
  const file = safeJoin(root, rel);
  const st = await fs.stat(file);

  if (st.isDirectory()) {
    return {
      error: "EISDIR",
      mime: "inode/directory",
      encoding: "none",
      content: "",
    };
  }

  const mime = mimeFor(file);
  const texty = looksText(file);
  const isImage = mime.startsWith("image/");

  if (texty) {
    const content = await fs.readFile(file, "utf8");
    return { content, mime, encoding: "utf8" };
  }

  if (isImage) {
    try {
      const buf = await sharp(file)
        .resize({ width: 800 })
        .jpeg({ quality: 70 })
        .toBuffer();
      return {
        content: buf.toString("base64"),
        mime: "image/jpeg",
        encoding: "base64",
      };
    } catch (e) {
      return { error: e?.message || "Image processing failed" };
    }
  }

  const buf = await fs.readFile(file);
  return {
    content: buf.toString("base64"),
    mime,
    encoding: "base64",
  };
}

export async function fsWrite({ ws, path: rel, content = "" }) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };

  const file = safeJoin(w.path, rel);
  const tmp = file + ".tmp";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
  return { ok: true };
}

export async function fsBundle({
  ws,
  path: rel = ".",
  recursive = true,
  maxFiles = 500,
  maxBytesTotal = 2_000_000,
  maxBytesPerFile = 2_000_000,
  includeHidden = true,
  includeBinary = true,
  concurrency = 8,
  ignore = DEFAULT_BUNDLE_IGNORES,
  followSymlinks = false,
}) {
  let effectiveRel = rel || ".";
  if (effectiveRel.startsWith("/")) effectiveRel = effectiveRel.slice(1);

  const { path: wsRoot } = await WorkspaceStore.ensureWs(ws);
  const startAbs = safeJoin(wsRoot, effectiveRel);

  const out = {
    workspace: ws,
    root: effectiveRel,
    recursive,
    files: [],
    limits: { maxFiles, maxBytesTotal, maxBytesPerFile },
    totals: { files: 0, bytesContent: 0 },
    truncated: false,
  };

  const stop = () =>
    out.truncated ||
    out.files.length >= maxFiles ||
    out.totals.bytesContent >= maxBytesTotal;

  const ignoreMatch = makeIgnoreMatcher(ignore);

  const pushDir = (relPath, st) => {
    if (!recursive) return;
    out.files.push({
      path: relPath,
      type: "dir",
      size: st.size,
      mtime: st.mtimeMs,
    });
    out.totals.files++;
  };

  const pushFile = (relPath, st, encoding, content, truncated) => {
    out.files.push({
      path: relPath,
      type: "file",
      size: st.size,
      mtime: st.mtimeMs,
      encoding,
      ...(content != null ? { content } : {}),
      ...(truncated ? { truncated: true } : {}),
    });
    out.totals.files++;
  };

  try {
    const st = await statSafe(startAbs);
    if (!st) return { error: "Not found" };

    if (st.isDirectory()) {
      await walkTreeConcurrent(startAbs, effectiveRel, {
        includeHidden,
        concurrency,
        stop,
        followSymlinks,
        shouldSkip: (name, relPath, isDir) => {
          if (!includeHidden && name.startsWith(".")) return true;
          if (ignoreMatch(relPath, isDir)) return true;
          if (!recursive && isDir) return true;
          return false;
        },
        async onDir(abs, relPath, dirStat) {
          if (stop()) return;
          pushDir(relPath, dirStat);
        },
        async onFile(abs, relPath, fileStat) {
          if (stop()) return;
          const isText = looksText(abs);
          const remaining = maxBytesTotal - out.totals.bytesContent;
          const budget =
            remaining > 0 ? Math.min(maxBytesPerFile, remaining) : 0;
          if (budget <= 0) {
            out.truncated = true;
            return;
          }

          const { content, usedBytes, truncated, encoding } =
            await readWithBudget(abs, {
              isText,
              budget,
              includeBinary,
              stat: fileStat,
            });

          if (encoding !== "none") out.totals.bytesContent += usedBytes;
          pushFile(relPath, fileStat, encoding, content, truncated);
          if (stop()) out.truncated = true;
        },
      });
    } else {
      const isText = looksText(startAbs);
      const budget = Math.min(maxBytesPerFile, maxBytesTotal);
      const { content, usedBytes, truncated, encoding } = await readWithBudget(
        startAbs,
        {
          isText,
          budget,
          includeBinary,
          stat: st,
        }
      );
      if (encoding !== "none") out.totals.bytesContent += usedBytes;
      pushFile(effectiveRel, st, encoding, content, truncated);
    }

    if (
      out.files.length >= maxFiles ||
      out.totals.bytesContent >= maxBytesTotal
    ) {
      out.truncated = true;
    }
    return out;
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

export async function fsApply({ ws, files }) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };
  if (!Array.isArray(files)) return { error: "files[] required" };

  for (const f of files) {
    const abs = safeJoin(w.path, f.path);
    if (f.delete) {
      try {
        await fs.rm(abs, { recursive: true, force: true });
      } catch {}
      continue;
    }
    if (f.type === "dir") {
      await fs.mkdir(abs, { recursive: true });
      continue;
    }
    if (f.type === "file") {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const buf = Buffer.from(
        f.content || "",
        f.encoding === "base64" ? "base64" : "utf8"
      );
      const tmp = abs + ".tmp";
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, abs);
    }
  }
  return { ok: true, applied: files.length };
}

export async function fsMkdir({ ws, path: rel, recursive = true }) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };
  const abs = safeJoin(w.path, rel);
  await fs.mkdir(abs, { recursive });
  return { ok: true };
}

export async function fsRename({ ws, from, to }) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };
  const absFrom = safeJoin(w.path, from);
  const absTo = safeJoin(w.path, to);
  try {
    await fs.rename(absFrom, absTo);
  } catch (e) {
    if (e && e.code === "EXDEV") {
      await fs.cp(absFrom, absTo, {
        recursive: true,
        force: true,
        errorOnExist: false,
      });
      await fs.rm(absFrom, { recursive: true, force: true });
    } else {
      throw e;
    }
  }
  return { ok: true };
}

export async function fsMove(args) {
  return fsRename(args);
}

export async function fsDelete({ ws, paths, recursive = true, force = true }) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };
  if (!Array.isArray(paths) || paths.length === 0)
    return { error: "paths[] required" };

  let deleted = 0;
  for (const p of paths) {
    const abs = safeJoin(w.path, p);
    try {
      await fs.rm(abs, { recursive, force });
      deleted++;
    } catch {}
  }
  return { ok: true, deleted };
}

export async function fsCopy({
  ws,
  from,
  to,
  recursive = true,
  overwrite = true,
}) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };
  const absFrom = safeJoin(w.path, from);
  const absTo = safeJoin(w.path, to);
  await fs.cp(absFrom, absTo, {
    recursive,
    force: !!overwrite,
    errorOnExist: !overwrite,
  });
  return { ok: true };
}

export async function fsTouch({ ws, path: rel }) {
  const w = await WorkspaceStore.ensureWs(ws);
  if (w.readOnly) return { error: "Workspace is read-only" };
  const abs = safeJoin(w.path, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const now = new Date();
  try {
    await fs.utimes(abs, now, now);
  } catch {
    await fs.writeFile(abs, "");
  }
  return { ok: true };
}

export async function fsReadSnapshot({
  ws,
  path: baseRel = ".",
  recursive = true,
  maxFiles = 500,
  maxBytesTotal = 2_000_000,
  maxBytesPerFile = 2_000_000,
  includeHidden = true,
  ignore = DEFAULT_SNAPSHOT_IGNORES,
  concurrency = 8,
  followSymlinks = false,
}) {
  let rel = baseRel || ".";
  if (rel.startsWith("/")) rel = rel.slice(1);

  const recursiveBool =
    recursive === true ||
    recursive === 1 ||
    recursive === "1" ||
    (typeof recursive === "string" && recursive.toLowerCase() === "true");

  const { path: wsRoot } = await WorkspaceStore.ensureWs(ws);
  const startAbs = safeJoin(wsRoot, rel);

  const out = { workspace: ws, path: rel, files: [] };

  const st = await statSafe(startAbs);
  if (!st) return { error: "Not found" };

  const ignoreMatch = makeIgnoreMatcher(ignore);

  let bytesUsed = 0;
  let truncated = false;
  const stop = () =>
    truncated || out.files.length >= maxFiles || bytesUsed >= maxBytesTotal;

  const pushFile = (relPath, content) => {
    out.files.push({
      path: relPath,
      name: path.posix.basename(relPath),
      content,
    });
  };

  try {
    if (st.isDirectory()) {
      await walkTreeConcurrent(startAbs, rel, {
        includeHidden,
        concurrency,
        stop,
        followSymlinks,
        shouldSkip: (name, relPath, isDir) => {
          if (!includeHidden && name.startsWith(".")) return true;
          if (ignoreMatch(relPath, isDir)) return true;
          if (!recursiveBool && isDir) return true;
          return false;
        },
        async onDir() {},
        async onFile(abs, relPath, fileStat) {
          if (stop()) return;
          if (!looksText(abs)) return;

          const remaining = maxBytesTotal - bytesUsed;
          const budget =
            remaining > 0 ? Math.min(maxBytesPerFile, remaining) : 0;
          if (budget <= 0) {
            truncated = true;
            return;
          }

          const { content, usedBytes } = await readWithBudget(abs, {
            isText: true,
            budget,
            includeBinary: false,
            stat: fileStat,
          });
          if (typeof content !== "string") return;

          bytesUsed += usedBytes;
          pushFile(relPath, content);
          if (stop()) truncated = true;
        },
      });
    } else {
      if (!looksText(startAbs)) return out;
      const { content, usedBytes } = await readWithBudget(startAbs, {
        isText: true,
        budget: Math.min(maxBytesPerFile, maxBytesTotal),
        includeBinary: false,
        stat: st,
      });
      if (typeof content === "string") {
        bytesUsed += usedBytes;
        pushFile(rel, content);
      }
    }
    return out;
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

export async function fsWriteSnapshot({
  ws,
  path: baseRel = ".",
  files = [],
  deleteMissing = false,
  includeHidden = true,
  ignore = DEFAULT_SNAPSHOT_IGNORES,
  concurrency = 8,
  followSymlinks = false,
  dryRun = false,
}) {
  if (!Array.isArray(files)) return { error: "files[] required" };

  let rel = baseRel || ".";
  if (rel.startsWith("/")) rel = rel.slice(1);

  const { path: wsRoot } = await WorkspaceStore.ensureWs(ws);
  const startAbs = safeJoin(wsRoot, rel);

  // normalize desired set
  const desired = new Set(
    files
      .map((f) => String(f?.path || "").trim())
      .filter(Boolean)
      .map((p) => path.posix.normalize(p).replace(/^\.\/+/, ""))
  );

  // Build apply plan
  const plan = [];
  // writes (atomic via fsApply)
  for (const f of files) {
    const p = String(f?.path || "").trim();
    if (!p) continue;
    const norm = path.posix.normalize(p).replace(/^\.\/+/, "");
    plan.push({
      path: path.posix.join(rel, norm),
      type: "file",
      encoding: "utf8",
      content: String(f?.content ?? ""),
    });
  }

  // Optional deletions (text files only, filtered like fsReadSnapshot)
  if (deleteMissing) {
    const st = await statSafe(startAbs);
    if (!st) return { error: "Base path not found" };

    const ignoreMatch = makeIgnoreMatcher(ignore);
    const existing = [];

    if (st.isDirectory()) {
      await walkTreeConcurrent(startAbs, rel, {
        includeHidden,
        concurrency,
        followSymlinks,
        shouldSkip: (name, relPath, isDir) => {
          if (!includeHidden && name.startsWith(".")) return true;
          if (ignoreMatch(relPath, isDir)) return true;
          return false;
        },
        async onDir() {},
        async onFile(abs, relPath /*, fileStat */) {
          if (!looksText(abs)) return;
          existing.push(relPath);
        },
      });
    } else {
      if (looksText(startAbs)) existing.push(rel);
    }

    for (const p of existing) {
      const relUnderBase = path.posix.relative(rel, p);
      const key = relUnderBase || path.posix.basename(p);
      if (!desired.has(key)) {
        plan.push({ path: p, delete: true });
      }
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      plan,
      summary: {
        writes: files.length,
        deletes: plan.filter((x) => x.delete).length,
      },
    };
  }

  const res = await fsApply({ ws, files: plan });
  return {
    ok: !!res?.ok,
    applied: res?.applied ?? 0,
    summary: {
      writes: files.length,
      deletes: plan.filter((x) => x.delete).length,
    },
  };
}

// ---------- Back-compat shim (optional) ----------
export function createFsService(/* { workspaces, root } = {} */) {
  // Old API returned an object of functions; we just return the same singleton-backed fns.
  return {
    fsWorkspaces,
    fsList,
    fsRead,
    fsWrite,
    fsBundle,
    fsReadSnapshot,
    fsWriteSnapshot, // still available via fsApply+plan, left here as-is
    fsApply,
    fsMkdir,
    fsRename,
    fsDelete,
    fsCopy,
    fsMove,
    fsTouch,
  };
}
