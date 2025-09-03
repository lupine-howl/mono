// config.plugins.js
export default [
  //() => import("@loki/minihttp/plugin").then((m) => m.default),
  () => import("@loki/tasks/plugin").then((m) => m.default),
  //() => import("@loki/self-code-test/plugin").then((m) => m.default),
  () => import("@loki/file-browser/plugin").then((m) => m.default),
  () => import("@loki/file-viewer-advanced/plugin").then((m) => m.default),
  //() => import("@loki/db/plugin").then((m) => m.default),
  () => import("@loki/ai-chat/plugin").then((m) => m.default),
  //() => import("@loki/ai-projects/plugin").then((m) => m.default),
  () => import("@loki/ai-image-gen/plugin").then((m) => m.default),
  () => import("@loki/terminal/plugin").then((m) => m.default),
];
