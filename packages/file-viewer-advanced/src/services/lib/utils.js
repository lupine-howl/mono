// fs/utils.js
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Read dir entries sorted: directories first, then files, both lexicographically. */
export async function listDirSorted(absDir) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  return entries.sort((a, b) => {
    const ta = a.isDirectory() ? 0 : 1;
    const tb = b.isDirectory() ? 0 : 1;
    return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
  });
}

/** Try/catch stat → null on error. */
export async function statSafe(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

/** Filter for bundle: hide dotfiles (optional) and skip node_modules. */
export function shouldSkipEntry(name, { includeHidden }) {
  if (!includeHidden && name.startsWith(".")) return true;
  if (name === "node_modules") return true;
  return false;
}

/**
 * Read a file respecting a byte budget.
 * Returns { content, usedBytes, truncated, encoding }
 */
// fs/utils.js
export async function readWithBudget(
  absPath,
  { isText, budget, includeBinary, stat } = {}
) {
  const st = stat ?? (await fs.stat(absPath).catch(() => null));
  if (!st || st.isDirectory())
    return { content: null, usedBytes: 0, truncated: false, encoding: "none" };

  const encoding = isText ? "utf8" : includeBinary ? "base64" : "none";
  if (encoding === "none")
    return { content: null, usedBytes: 0, truncated: false, encoding };

  // decide how much to read
  const fileSize = st.size ?? 0;
  const limit =
    typeof budget === "number" && budget >= 0
      ? Math.min(budget, fileSize)
      : fileSize;
  const readBytes = Math.max(0, limit);
  if (readBytes === 0)
    return { content: "", usedBytes: 0, truncated: fileSize > 0, encoding };

  const fh = await fs.open(absPath, "r");
  try {
    const buf = Buffer.allocUnsafe(readBytes);
    let off = 0;
    while (off < readBytes) {
      const { bytesRead } = await fh.read(
        buf,
        off,
        Math.min(65536, readBytes - off),
        off
      );
      if (bytesRead === 0) break;
      off += bytesRead;
    }
    const slice = buf.subarray(0, off);
    const content = isText ? slice.toString("utf8") : slice.toString("base64");
    const truncated = readBytes < fileSize;
    return { content, usedBytes: off, truncated, encoding };
  } finally {
    await fh.close();
  }
}

/**
 * Generic recursive directory walker.
 *
 * @param {string} absDir    Absolute path to start
 * @param {string} relDir    Relative path to report in results
 * @param {object} opts      Options: { includeHidden, onDir, onFile, shouldSkip? }
 * @param {function} opts.onDir   async (absPath, relPath, stat) => void
 * @param {function} opts.onFile  async (absPath, relPath, stat) => void
 * @param {function} [opts.shouldSkip] optional filter, defaults to skip dotfiles/node_modules
 */
export async function walkTree(absDir, relDir = ".", opts = {}) {
  const { includeHidden = true, onDir, onFile } = opts;
  const skip =
    opts.shouldSkip || ((name) => shouldSkipEntry(name, { includeHidden }));

  const entries = await listDirSorted(absDir);
  for (const ent of entries) {
    if (skip(ent.name)) continue;

    const absChild = path.join(absDir, ent.name);
    const relChild = relDir === "." ? ent.name : `${relDir}/${ent.name}`;
    const st = await statSafe(absChild);
    if (!st) continue;

    if (ent.isDirectory()) {
      if (onDir) await onDir(absChild, relChild, st);
      await walkTree(absChild, relChild, opts);
    } else {
      if (onFile) await onFile(absChild, relChild, st);
    }
  }
}

// fs/utils.js
export function createLimiter(max = 8, shouldStop = () => false) {
  let active = 0;
  const q = [];
  const run = (fn) =>
    new Promise((resolve, reject) => {
      const task = async () => {
        // cancel queued work if we've exceeded limits
        if (shouldStop()) {
          resolve(undefined);
          return;
        }
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          active--;
          if (q.length) q.shift()();
        }
      };
      // if already stopped, don’t even enqueue
      if (shouldStop()) {
        resolve(undefined);
        return;
      }
      active < max ? task() : q.push(task);
    });
  return run;
}

// fs/utils.js (update walkTreeConcurrent)
export async function walkTreeConcurrent(absDir, relDir = ".", opts = {}) {
  const {
    includeHidden = true,
    shouldSkip,
    onDir,
    onFile,
    concurrency = 8,
    stop = () => false,
    followSymlinks = false, // NEW
  } = opts;

  const limit = createLimiter(concurrency, stop);

  const _shouldSkip = (name, relPath, isDir) => {
    if (!shouldSkip) return !includeHidden && name.startsWith(".");
    if (shouldSkip.length <= 1) return shouldSkip(name);
    return shouldSkip(name, relPath, isDir);
  };

  async function visitDir(abs, rel) {
    if (stop()) return;
    const entries = await fs
      .readdir(abs, { withFileTypes: true })
      .catch(() => []);
    entries.sort((a, b) =>
      a.isDirectory() === b.isDirectory()
        ? a.name.localeCompare(b.name)
        : a.isDirectory()
        ? -1
        : 1
    );

    const tasks = [];
    for (const ent of entries) {
      if (stop()) break;
      const name = ent.name;
      const absChild = path.join(abs, name);
      const relChild = rel === "." ? name : `${rel}/${name}`;

      tasks.push(
        limit(async () => {
          if (stop()) return;

          // lstat first to detect symlinks
          const lst = await fs.lstat(absChild).catch(() => null);
          if (!lst) return;

          // skip symlinked directories by default (pnpm trees)
          if (lst.isSymbolicLink() && !followSymlinks) {
            // If it's a symlink to a file and you still want to include file content,
            // you can add extra logic here; default is: skip all symlinks.
            return;
          }

          // get a 'stat' view if following links; else reuse lstat
          const st = followSymlinks
            ? await fs.stat(absChild).catch(() => null)
            : lst;
          if (!st) return;

          const isDir = st.isDirectory();
          if (_shouldSkip(name, relChild, isDir)) return;

          if (isDir) {
            if (onDir) await onDir(absChild, relChild, st);
            if (stop()) return;
            await visitDir(absChild, relChild);
          } else {
            if (onFile) await onFile(absChild, relChild, st);
          }
        })
      );
    }
    await Promise.allSettled(tasks);
  }

  await visitDir(absDir, relDir);
}

export function makeIgnoreMatcher(patterns = []) {
  const rules = (patterns || [])
    .map((raw) => String(raw || "").trim())
    .filter(Boolean);

  // precompile simple wildcards into regex once
  const compiled = rules.map((r) => {
    const isDirRule = r.endsWith("/");
    const base = isDirRule ? r.slice(0, -1) : r;
    const hasStar = base.includes("*");
    const regex = hasStar
      ? new RegExp(
          // match at path boundary
          `(^|/)${base
            .replace(/[.+^${}()|[\\]\\\\]/g, "\\$&")
            .replace(/\\\*/g, ".*")}$`
        )
      : null;
    return { isDirRule, base, regex };
  });

  return function matchIgnored(relPath, isDir) {
    const p = relPath; // assume posix-like rel paths
    const name = path.posix.basename(p);

    for (const rule of compiled) {
      if (rule.isDirRule) {
        // skip any directory named base anywhere, and anything under it
        if (isDir && name === rule.base) return true;
        if (
          p === rule.base ||
          p.startsWith(`${rule.base}/`) ||
          p.includes(`/${rule.base}/`)
        ) {
          return true;
        }
        continue;
      }

      if (rule.regex) {
        if (rule.regex.test(p)) return true;
      } else {
        if (name === rule.base) return true;
      }
    }
    return false;
  };
}
