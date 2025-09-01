// config.plugins.js
export default [() => import("@loki/tasks/plugin").then((m) => m.default)];
