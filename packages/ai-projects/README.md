# AI Tool Chat (Minimal)

A zero-build, minimal-dependency chat UI with a tiny Node server. Uses:
- **Web Components with Lit** via CDN (no bundler, no transpile)
- **Native Node `fetch`** (Node 18+) to call OpenAI's Chat Completions API
- **No npm dependencies**

## Quick start

1. **Set your API key**

```sh
export OPENAI_API_KEY=sk-...
```

2. **Run**

```sh
node server/server.js
```

Open http://localhost:5173 in your browser.

## Project layout

```
.
├── public
│   ├── index.html         # Loads the web component
│   └── chat-app.js        # <chat-app> component (Lit)
├── server
│   └── server.js          # Minimal static server + /api/chat endpoint
└── src
    ├── AITool.js          # Base class
    ├── OpenAITool.js      # Generic OpenAI client (function-call capable)
    └── OpenAIChatTool.js  # Chat only (no tool calling forced)
```

> If you want to use tool/function calling, instantiate `OpenAITool` and pass a `tool` definition. The provided server endpoint uses `OpenAIChatTool` for a straightforward chat experience.

## Notes

- This project is purposefully tiny and tasteful. Swap Lit for another option if you prefer (Alpine, Petite-Vue, htm/preact, or plain Custom Elements). The server does not use Express to keep dependencies at **zero**.
- Requires Node 18+ (for built-in `fetch`).