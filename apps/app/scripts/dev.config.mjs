// scripts/dev.config.mjs
export default {
  // Watch every package's source + package.json
  watchDirs: ["../../packages/*/src", "../../packages/*/package.json"],
  // Keep this tight so we don't double-trigger via node_modules links
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.git/**",
    "**/.turbo/**",
    "**/.nx/**",
  ],
};
