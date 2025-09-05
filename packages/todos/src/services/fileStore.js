import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_DIR = "data";
const DEFAULT_FILE = "todos.json";

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }

export async function readTodos({ rootDir = process.cwd(), dataDir = DEFAULT_DIR, file = DEFAULT_FILE } = {}) {
  const dir = path.isAbsolute(dataDir) ? dataDir : path.join(rootDir, dataDir);
  const p = path.join(dir, file);
  try {
    const buf = await fs.readFile(p);
    const parsed = JSON.parse(String(buf));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e && (e.code === "ENOENT")) return [];
    throw e;
  }
}

export async function writeTodos(items, { rootDir = process.cwd(), dataDir = DEFAULT_DIR, file = DEFAULT_FILE } = {}) {
  const dir = path.isAbsolute(dataDir) ? dataDir : path.join(rootDir, dataDir);
  await ensureDir(dir);
  const p = path.join(dir, file);
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(items, null, 2));
  await fs.rename(tmp, p);
  return p;
}
