import { createFsService } from "./service.js";
import { DEFAULT_WORKSPACES, DEFAULT_SNAPSHOT_IGNORES } from "./constants.js";
import path from "node:path";

export function registerFsTools(
  tools,
  { workspaces = DEFAULT_WORKSPACES, logEntry } = {}
) {
  if (!workspaces) throw new Error("registerFsTools requires { workspaces }");

  const svc = createFsService({ workspaces });

  // ---- Download (binary-safe) -----------------------------------------------

  // Guess a filename & extension from URL/header
  function guessName({ url, contentType, fallback = "download.bin" }) {
    try {
      const u = new URL(url);
      let name = decodeURIComponent(u.pathname.split("/").pop() || "");
      if (!name) name = fallback;

      // Add extension from content-type if missing
      if (!name.includes(".") && contentType) {
        const ext = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/jpg": "jpg",
          "image/webp": "webp",
          "image/gif": "gif",
          "image/svg+xml": "svg",
          "application/pdf": "pdf",
        }[contentType.toLowerCase()];
        if (ext) name = `${name}.${ext}`;
      }
      return name;
    } catch {
      return fallback;
    }
  }

  tools.define({
    name: "fsDownload",
    description:
      "Download a remote file and save into a workspace (binary-safe via base64). Returns { ws, path, bytes, mime }.",
    parameters: {
      type: "object",
      required: ["ws", "url", "to"],
      properties: {
        ws: { type: "string", description: "Workspace id" },
        url: { type: "string", description: "http(s) URL to fetch" },
        to: {
          type: "string",
          description:
            "Destination file path (relative to workspace). If ends with '/', the filename is inferred.",
        },
        overwrite: { type: "boolean", default: true },
        timeoutMs: { type: "integer", default: 30000 },
      },
      additionalProperties: false,
    },
    tags: ["FS"],
    handler: async ({ ws, url, to, overwrite = true, timeoutMs = 30000 }) => {
      if (!/^https?:\/\//i.test(url)) {
        return { error: "Only http(s) URLs are supported." };
      }

      // Fetch with simple timeout
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal }).catch((e) => ({
        ok: false,
        status: 0,
        error: e,
      }));
      clearTimeout(t);

      if (!res?.ok) {
        return { error: `Download failed: ${res?.status || 0}` };
      }

      const contentType = res.headers.get("content-type") || "";
      const ab = await res.arrayBuffer();
      const b64 = Buffer.from(ab).toString("base64");
      const bytes = ab.byteLength;

      // Determine final path
      const looksLikeDir = to.endsWith("/");
      const fileName = looksLikeDir
        ? guessName({ url, contentType, fallback: "download.bin" })
        : "";
      const dest = looksLikeDir ? path.posix.join(to, fileName) : to;

      // Ensure parent dir exists
      const dir = path.posix.dirname(dest);
      await svc.fsMkdir({ ws, path: dir, recursive: true });

      // Write file (binary via base64)
      await svc.fsApply({
        ws,
        files: [
          {
            path: dest,
            type: "file",
            encoding: "base64",
            content: b64,
            overwrite,
          },
        ],
      });

      return {
        ok: true,
        ws,
        path: dest,
        bytes,
        mime: contentType || "application/octet-stream",
        filename: path.posix.basename(dest),
        from: url,
      };
    },
  });

  tools.define({
    name: "fsWorkspaces",
    description: "List available workspaces",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    safe: true,
    handler: () => svc.fsWorkspaces(),
    tags: ["FS"],
  });

  tools.define({
    name: "fsList",
    description: "List directory items",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string", description: "Workspace id" },
        rel: { type: "string", description: "Relative path", default: "." },
      },
      additionalProperties: false,
    },
    safe: true,
    handler: (args) => svc.fsList(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsReadSnapshot",
    description:
      "AI-friendly snapshot of a project: files only, text only, with ignore rules.",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        path: { type: "string", default: "." },
        recursive: { type: "boolean", default: true },
        includeHidden: { type: "boolean", default: true },
        ignore: { type: "array", items: { type: "string" } },
        maxFiles: { type: "integer", default: 500 },
        maxBytesTotal: { type: "integer", default: 2_000_000 },
        maxBytesPerFile: { type: "integer", default: 2_000_000 },
        concurrency: { type: "integer", default: 8 },
      },
      additionalProperties: false,
    },
    safe: true,
    handler: (args) => svc.fsReadSnapshot(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsWriteSnapshot",
    description:
      "Apply a text-only snapshot under a base path. Optional deleteMissing + dryRun.",
    parameters: {
      type: "object",
      required: ["ws", "files"],
      properties: {
        ws: { type: "string" },
        path: { type: "string", default: "." },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        deleteMissing: { type: "boolean", default: false },
        includeHidden: { type: "boolean", default: true },
        ignore: {
          type: "array",
          items: { type: "string" },
          default: DEFAULT_SNAPSHOT_IGNORES,
        },
        concurrency: { type: "integer", default: 8 },
        followSymlinks: { type: "boolean", default: false },
        dryRun: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsWriteSnapshot(args),
    tags: ["FS", "BATCH"],
  });

  tools.define({
    name: "fsRead",
    description: "Read a file (utf8/base64 envelope)",
    parameters: {
      type: "object",
      required: ["ws", "path"],
      properties: { ws: { type: "string" }, path: { type: "string" } },
      additionalProperties: false,
    },
    safe: true,
    handler: (args) => svc.fsRead(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsBundle",
    description: "Bundle a directory tree (content subject to limits)",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        path: { type: "string", default: "." },
        recursive: { type: "boolean", default: true },
        maxFiles: { type: "integer", default: 500 },
        maxBytesTotal: { type: "integer", default: 2000000 },
        maxBytesPerFile: { type: "integer", default: 2000000 },
        includeHidden: { type: "boolean", default: true },
        includeBinary: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    safe: true,
    handler: (args) => svc.fsBundle(args),
    tags: ["FS"],
  });

  // tools.js (append near the others)
  tools.define({
    name: "fsSnapshot",
    description:
      "AI-friendly snapshot of a project: files only, text only, with ignore rules. Returns { files: [{ path, name, content }] }",
    parameters: {
      type: "object",
      required: ["ws"],
      properties: {
        ws: { type: "string" },
        path: { type: "string", default: "." },
        recursive: { type: "boolean", default: true },
        includeHidden: { type: "boolean", default: true },
        ignore: {
          type: "array",
          items: { type: "string" },
          description:
            "Patterns to skip (e.g. 'node_modules/', 'dist/', 'package-lock.json')",
        },
        maxFiles: { type: "integer", default: 500 },
        maxBytesTotal: { type: "integer", default: 2000000 },
        maxBytesPerFile: { type: "integer", default: 2000000 },
        concurrency: { type: "integer", default: 8 },
      },
      additionalProperties: false,
    },
    safe: true,
    handler: (args) => svc.fsSnapshot(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsWrite",
    description: "Write a single file (atomic tmp → rename)",
    parameters: {
      type: "object",
      required: ["ws", "path"],
      properties: {
        ws: { type: "string" },
        path: { type: "string" },
        content: { type: "string", description: "UTF-8 text content" },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const out = await svc.fsWrite(args);
      if (logEntry && !out.error) {
        try {
          logEntry({
            method: "RPC",
            path: "fsWrite",
            note: `${args.ws}:${args.path} (${
              (args.content || "").length
            } chars)`,
          });
        } catch {}
      }
      return out;
    },
    tags: ["FS"],
  });

  tools.define({
    name: "fsApply",
    description: "Apply multiple file ops (create/write/delete)",
    parameters: {
      type: "object",
      required: ["ws", "files"],
      properties: {
        ws: { type: "string" },
        files: {
          type: "array",
          items: { type: "object" },
          description: `[{ path, type:"file"|"dir", encoding?, content? } | { path, delete:true }]`,
        },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsApply(args),
    tags: ["FS"],
  });

  // tools.js (append these tool definitions after existing ones)

  tools.define({
    name: "fsMkdir",
    description: "Create a directory",
    parameters: {
      type: "object",
      required: ["ws", "path"],
      properties: {
        ws: { type: "string" },
        path: { type: "string", description: "Directory to create" },
        recursive: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    handler: (args) =>
      svc.fsMkdir({ ws: args.ws, path: args.path, recursive: args.recursive }),
    tags: ["FS"],
  });

  tools.define({
    name: "fsRename",
    description: "Rename or move a file/directory (EXDEV-safe)",
    parameters: {
      type: "object",
      required: ["ws", "from", "to"],
      properties: {
        ws: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsRename(args),
    tags: ["FS"],
  });

  // Alias, if you prefer move semantics in clients
  tools.define({
    name: "fsMove",
    description: "Move a file/directory (alias of fsRename; EXDEV-safe)",
    parameters: {
      type: "object",
      required: ["ws", "from", "to"],
      properties: {
        ws: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsMove(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsDelete",
    description: "Delete files/directories",
    parameters: {
      type: "object",
      required: ["ws", "paths"],
      properties: {
        ws: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        recursive: { type: "boolean", default: true },
        force: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsDelete(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsCopy",
    description: "Copy file/directory",
    parameters: {
      type: "object",
      required: ["ws", "from", "to"],
      properties: {
        ws: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        recursive: { type: "boolean", default: true },
        overwrite: { type: "boolean", default: true },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsCopy(args),
    tags: ["FS"],
  });

  tools.define({
    name: "fsTouch",
    description: "Create file if missing or update mtime",
    parameters: {
      type: "object",
      required: ["ws", "path"],
      properties: {
        ws: { type: "string" },
        path: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: (args) => svc.fsTouch(args),
    tags: ["FS"],
  });
}
