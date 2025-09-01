# @loki/tasks

A tiny tasks toolkit using the same pluggable architecture as personas:

- Controller (`TaskController`) in **shared** (DOM-free)
- UI components (`<task-list>`, `<task-viewer>`) in **ui**
- Plugin factory (`createPlugin`) that returns `{ controllers, components, ready, dispose }`
- Example app that uses a BasePluggableApp layout and loads the plugin

Works standalone in the example via `esbuild`. No backend required other than the demo RPC server in examples.
