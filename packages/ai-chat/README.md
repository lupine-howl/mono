# AI Chat (ai-chat)

A modular AI chat toolkit built as a collection of web components and a small Node-based API surface. It is designed to be embedded into host applications with zero runtime dependencies in the browser (UI) and a minimal, localable server side surface that talks to OpenAI.

## What’s included
- UI components built with Lit (exposed under ./ui/* exports)
- A small server surface that routes to OpenAI’s Chat Completions API and a models list
- Optional tool invocation support (registry-based tool calls)
- A lightweight persistence adapter interface (dbInsert/dbSelect/etc) for local demos
- An ES module build system using esbuild; friendly to bundlers and modern runtimes

## Quick start
Prerequisites:
- Node.js 18+ (for fetch in Node and modern ESM)
- npm or yarn

1) Install dependencies (from repo root or navigate to the package)

```bash
cd packages/ai-chat
npm install
```

2) Build the project

```bash
npm run build
```
This will build:
- dist/ui
- dist/services
- dist/shared
- dist/schemas
- dist/plugin

3) Run a local test (optional)
Since this package is primarily UI components and a small API surface, you typically host the UI in a host page and point the server to your OpenAI API key. For quick experiments you can expose the API using your favorite Node server, or adapt the open-ended examples below.

If you want a quick static demo, serve a simple HTML that imports UI modules from dist/ui. Example static server:

```bash
npx http-server ./ai-chat/dist/ui -p 5173
```
Open http://localhost:5173 in your browser. Ensure you’ve configured OPENAI_API_KEY in your environment if you’re hitting the OpenAI API.
```

4) Environment configuration
- OPENAI_API_KEY: Your OpenAI API key (required for server routes to talk to OpenAI)

Optional:
- If you’re using Verdaccio for local npm publishing in development, ensure your local registry is configured for @loki scope as documented in Verdaccio setup.

## Project layout

```
ai-chat/
├── package.json           # package manifest for @loki/ai-chat
├── README.md                # this file
├── src/
│   ├── services/            # server-side routes (chat, models, etc.)
│   ├── schemas/             # json schemas for messages
│   ├── shared/              # utilities and controllers
│   └── ui/                   # web components (chat-stream, chat-composer, etc.)
├── dist/                    # built artifacts (ui, services, shared, schemas, plugin)
└── public/ (optional)       # if you provide a tiny demo page
```

## How to use the package in your app
The package is designed to be consumed by host apps (web apps, or Node-based hosts) via ES modules.
- UI components are exposed under the ui/ exports (e.g. ui/chat-stream.js, ui/chat-composer.js).
- The server surface exposes tools under the services exports; you can wire a simple router and import { registerAITools } from "@loki/ai-chat".
- The plugin entry (./plugin) contains browser- and node-specific shims for ease of integration.

Example (ESM):

```js
// In a host app, import the UI components directly
import { ChatStream } from "@loki/ai-chat/ui/chat-stream.js";
import { ChatComposer } from "@loki/ai-chat/ui/chat-composer.js";

// Mount UI in your page (example, depending on your framework)
customElements.define("my-chat", class extends HTMLElement {
  connectedCallback() {
    // attach <chat-stream> or other UI parts
  }
});
```

For the server-side API:

```js
import { registerAITools } from "@loki/ai-chat";

// create your router and pass your tools registry to registerAITools
```

Configuration tips:
- OpenAI API key can be supplied via environment variable or via the API’s config in your host.
- If you need local testing with Verdaccio, follow the Verdaccio docs and point the @loki/ai-chat registry to your local registry while keeping npm publish to the real registry for production.

## Development workflow
- Build changes: npm run build
- Watch mode: npm run watch
- Publish patches: npm run publish:patch

Note: This package intentionally avoids heavy runtime dependencies in the browser. The UI builds are iife-free and rely on modern ESM modules.

## Contributing
- Submit issues and PRs with clear reproduction steps.
- Follow code style and tests where applicable.

## License
MIT

## Versioning
0.1.0 (initial public preview)

