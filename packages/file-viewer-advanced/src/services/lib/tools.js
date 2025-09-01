import { createFsService } from "./service.js";

export function registerFsTools(tools, { workspaces, logEntry } = {}) {
  if (!workspaces) throw new Error("registerFsTools requires { workspaces }");

  const svc = createFsService({ workspaces });

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
