// fs/service.js
import * as fs from "node:fs/promises";
import * as path from "node:path";
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
// fs/service.js (top of file)
const DEFAULT_BUNDLE_IGNORES = ["node_modules/", "dist/"];

export function createFsService({ workspaces }) {
  const ensureWs = makeEnsureWs(workspaces);

  async function fsWorkspaces() {
    return {
      workspaces: Object.entries(workspaces).map(([id, w]) => ({
        id,
        name: w.name,
        path: w.path,
        readOnly: !!w.readOnly,
      })),
    };
  }

  async function fsList({ ws, rel = "." }) {
    const { path: root } = ensureWs(ws);
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

  async function fsRead({ ws, path: rel }) {
    const { path: root } = ensureWs(ws);
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

    if (texty) {
      const content = await fs.readFile(file, "utf8");
      return { content, mime, encoding: "utf8" };
    } else {
      const buf = await fs.readFile(file);
      return { content: buf.toString("base64"), mime, encoding: "base64" };
    }
  }

  async function fsWrite({ ws, path: rel, content = "" }) {
    const w = ensureWs(ws);
    if (w.readOnly) return { error: "Workspace is read-only" };

    const file = safeJoin(w.path, rel);
    const tmp = file + ".tmp";
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, content, "utf8");
    await fs.rename(tmp, file);
    return { ok: true };
  }

  // fs/service.js (inside createFsService)
  async function fsBundle({
    ws,
    path: rel = ".",
    recursive = true,
    maxFiles = 500,
    maxBytesTotal = 2_000_000,
    maxBytesPerFile = 2_000_000,
    includeHidden = true,
    includeBinary = true,
    concurrency = 8,
    ignore = DEFAULT_BUNDLE_IGNORES, // NEW default
    followSymlinks = false, // NEW default
  }) {
    let effectiveRel = rel || ".";
    if (effectiveRel.startsWith("/")) effectiveRel = effectiveRel.slice(1);

    const { path: wsRoot } = ensureWs(ws);
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
      // keep directory entries only when recursive (same behavior as before)
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
            if (ignoreMatch(relPath, isDir)) return true; // ← SKIP node_modules/dist
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
        const { content, usedBytes, truncated, encoding } =
          await readWithBudget(startAbs, {
            isText,
            budget,
            includeBinary,
            stat: st,
          });
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

  async function fsApply({ ws, files }) {
    const w = ensureWs(ws);
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

  async function fsMkdir({ ws, path: rel, recursive = true }) {
    const w = ensureWs(ws);
    if (w.readOnly) return { error: "Workspace is read-only" };
    const abs = safeJoin(w.path, rel);
    await fs.mkdir(abs, { recursive });
    return { ok: true };
  }

  async function fsRename({ ws, from, to }) {
    const w = ensureWs(ws);
    if (w.readOnly) return { error: "Workspace is read-only" };
    const absFrom = safeJoin(w.path, from);
    const absTo = safeJoin(w.path, to);
    try {
      await fs.rename(absFrom, absTo);
    } catch (e) {
      // EXDEV: cross-device move → copy then remove
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

  async function fsMove(args) {
    // alias to fsRename for ergonomics
    return fsRename(args);
  }

  async function fsWriteSnapshot({
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
    const { path: wsRoot } = ensureWs(ws);
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
    // Ensure parent dirs + file writes (utf8 text, atomic via fsApply)
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

    // Optionally compute deletions (text files only, filtered like fsReadSnapshot)
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

    // Apply
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

  async function fsDelete({ ws, paths, recursive = true, force = true }) {
    const w = ensureWs(ws);
    if (w.readOnly) return { error: "Workspace is read-only" };
    if (!Array.isArray(paths) || paths.length === 0)
      return { error: "paths[] required" };

    let deleted = 0;
    for (const p of paths) {
      const abs = safeJoin(w.path, p);
      try {
        await fs.rm(abs, { recursive, force });
        deleted++;
      } catch {} // ignore per-item failures to be robust
    }
    return { ok: true, deleted };
  }

  async function fsCopy({ ws, from, to, recursive = true, overwrite = true }) {
    const w = ensureWs(ws);
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

  async function fsTouch({ ws, path: rel }) {
    const w = ensureWs(ws);
    if (w.readOnly) return { error: "Workspace is read-only" };
    const abs = safeJoin(w.path, rel);
    // ensure parent exists
    await fs.mkdir(path.dirname(abs), { recursive: true });
    // update mtime or create empty
    const now = new Date();
    try {
      await fs.utimes(abs, now, now);
    } catch {
      await fs.writeFile(abs, "");
    }
    return { ok: true };
  }

  async function fsReadSnapshot({
    ws,
    path: baseRel = ".",
    recursive = true,
    maxFiles = 500,
    maxBytesTotal = 2_000_000,
    maxBytesPerFile = 2_000_000,
    includeHidden = true,
    ignore = DEFAULT_SNAPSHOT_IGNORES,
    concurrency = 8,
    followSymlinks = false, // keep symlinks off here too
  }) {
    let rel = baseRel || ".";
    if (rel.startsWith("/")) rel = rel.slice(1);

    const recursiveBool =
      recursive === true ||
      recursive === 1 ||
      recursive === "1" ||
      (typeof recursive === "string" && recursive.toLowerCase() === "true");

    const { path: wsRoot } = ensureWs(ws);
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
            if (ignoreMatch(relPath, isDir)) return true; // ← SKIP node_modules/dist/…
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

  return {
    fsWorkspaces,
    fsList,
    fsRead,
    fsWrite,
    fsBundle,
    fsReadSnapshot,
    fsWriteSnapshot,
    fsApply,
    fsMkdir,
    fsRename,
    fsDelete,
    fsCopy,
    fsMove,
    fsTouch,
  };
}
