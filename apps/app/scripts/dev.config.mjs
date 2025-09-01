// scripts/dev.config.mjs
export default {
  // Put absolute or relative paths (relative to the app root)
  watchDirs: [
    "../../packages/tasks/dist",
    "../../packages/ai-chat/dist",
    "../../packages/ai-projects/dist",
    "../../packages/personas/dist",
    "../../packages/file-browser/dist",
    "../../packages/db/dist",
    "../../packages/layout/dist",
    "../../packages/minihttp/dist",
  ],
  // Optional: ignore globs
  ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
};
