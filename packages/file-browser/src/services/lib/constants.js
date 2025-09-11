// fs/constants.js
import * as path from "node:path";

export const TEXT_EXT_RE =
  /\.(txt|md|markdown|json|jsonc|js|mjs|cjs|ts|tsx|jsx|css|scss|sass|less|html|htm|xml|yml|yaml|ini|toml|csv|tsv|env|gitignore|dockerfile|sh|bash|bat|py|rb|php|go|rs|java|c|cc|cpp|h|hpp|m|mm|cs|sql|lua|pl|r|kt|swift|vue|svelte|mdx)$/i;

export const looksText = (p) => TEXT_EXT_RE.test(p);

export const DEFAULT_SNAPSHOT_IGNORES = [
  "node_modules/",
  "dist/",
  "package-lock.json",
  "package.lock",
];

export const EXT_MIME = {
  // ✅ Image types (NEW)
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",

  // ✅ Document and code types (existing, preserved)
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonc": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/tsx; charset=utf-8",
  ".jsx": "text/jsx; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".scss": "text/x-scss; charset=utf-8",
  ".sass": "text/x-sass; charset=utf-8",
  ".less": "text/x-less; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".yml": "application/x-yaml; charset=utf-8",
  ".yaml": "application/x-yaml; charset=utf-8",
  ".ini": "text/plain; charset=utf-8",
  ".toml": "application/toml; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".tsv": "text/tab-separated-values; charset=utf-8",
  ".env": "text/plain; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".bash": "text/x-shellscript; charset=utf-8",
  ".bat": "text/plain; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".rb": "text/x-ruby; charset=utf-8",
  ".php": "application/x-httpd-php; charset=utf-8",
  ".go": "text/x-go; charset=utf-8",
  ".rs": "text/x-rustsrc; charset=utf-8",
  ".java": "text/x-java-source; charset=utf-8",
  ".c": "text/x-c; charset=utf-8",
  ".h": "text/x-c; charset=utf-8",
  ".cc": "text/x-c++; charset=utf-8",
  ".cpp": "text/x-c++; charset=utf-8",
  ".hpp": "text/x-c++; charset=utf-8",
  ".m": "text/x-objectivec; charset=utf-8",
  ".mm": "text/x-objectivec++; charset=utf-8",
  ".cs": "text/x-csharp; charset=utf-8",
  ".sql": "application/sql; charset=utf-8",
  ".lua": "text/x-lua; charset=utf-8",
  ".r": "text/plain; charset=utf-8",
  ".kt": "text/x-kotlin; charset=utf-8",
  ".swift": "text/x-swift; charset=utf-8",
  ".vue": "text/x-vue; charset=utf-8",
  ".svelte": "text/plain; charset=utf-8",
  ".mdx": "text/mdx; charset=utf-8",
};

export const DEFAULT_FOLDER_IGNORES = [
  "node_modules/", // any node_modules directory
  "dist/", // any dist directory
  "package-lock.json",
  "package.lock", // being generous to typo
];

export const mimeFor = (file) =>
  EXT_MIME[path.extname(file).toLowerCase()] || "application/octet-stream";

export const sortDirsFirst = (a, b) =>
  a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1;

export const DEFAULT_WORKSPACES = {
  app: {
    name: "Main App",
    path: "/home/loki/dev/mono/apps/app",
    readOnly: false,
  },
  currentPackage: {
    name: "Current Package",
    path: path.resolve(process.cwd(), "."),
    readOnly: false,
  },
  packages: {
    name: "Packages",
    path: "/home/loki/dev/mono/packages",
    readOnly: false,
  },
  fileBrowser: {
    name: "File Browser Component",
    path: "/home/loki/dev/mono/packages/file-browser",
    readOnly: false,
  },
  fileViewerAdvanced: {
    name: "File Viewer Advanced",
    path: "/home/loki/dev/mono/packages/file-viewer-advanced",
    readOnly: false,
  },
  "ai-projects": {
    name: "Projects",
    path: "/home/loki/dev/mono/packages/ai-projects",
    readOnly: false,
  },
  minihttp: {
    name: "Mini HTTP Server",
    path: "/home/loki/dev/mono/packages/minihttp",
    readOnly: false,
  },
  chat: {
    name: "Chat Component",
    path: "/home/loki/dev/mono/packages/ai-chat",
    readOnly: false,
  },
  tasks: {
    name: "Tasks Component",
    path: "/home/loki/dev/mono/packages/tasks",
    readOnly: false,
  },
  selfCodeTest: {
    name: "Self Code Test",
    path: "/home/loki/dev/mono/packages/self-code-test",
    readOnly: false,
  },
  fmcWeb: {
    name: "FMC Web",
    path: "/home/loki/dev/fmc/web",
    readOnly: false,
  },
  fmcApi: {
    name: "FMC API",
    path: "/home/loki/dev/fmc/api",
    readOnly: false,
  },
  fmcOldWeb: {
    name: "FMC Old Web",
    path: "/home/loki/dev/fmc/web-2",
    readOnly: false,
  },
  fmcOldApi: {
    name: "FMC Old API",
    path: "/home/loki/dev/fmc/api-old",
    readOnly: false,
  },
  fmcNextLib: {
    name: "FMC Next Lib",
    path: "/home/loki/dev/fmc/next-lib",
    readOnly: false,
  },
};
