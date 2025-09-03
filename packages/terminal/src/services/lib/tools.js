import { createTerminalService } from "./service.js";

export function registerTerminalTools(
  tools,
  { workspaces, logEntry } = {}
) {
  if (!workspaces) throw new Error("registerTerminalTools requires { workspaces }");
  const svc = createTerminalService({ workspaces });

  // List workspaces (handy for the UI)
  tools.define({
    name: "termWorkspaces",
    description: "List available workspaces (terminal)",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    safe: true,
    handler: () => svc.termWorkspaces(),
    tags: ["TERMINAL"]
  });

  // argv-mode (no shell)
  tools.define({
    name: "termProcExec",
    description: "Run a process (argv) inside a workspace. No shell expansion.",
    parameters: {
      type: "object",
      required: ["ws", "cmd"],
      properties: {
        ws: { type: "string" },
        cmd: { type: "string" },
        args: { type: "array", items: { type: "string" }, default: [] },
        cwd: { type: "string", default: "." },
        timeoutMs: { type: "integer", default: 120000 },
        env: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
        stdin: { type: "string", default: "" },
        maxOutputBytes: { type: "integer", default: 1000000 }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const out = await svc.termProcExec(args);
      if (logEntry) {
        try {
          const argv = [args.cmd, ...(args.args||[])].join(" ");
          logEntry({ method: "RPC", path: "termProcExec", note: `${args.ws}:${args.cwd||"."} $ ${argv}` });
        } catch {}
      }
      return out;
    },
    tags: ["TERMINAL", "PROC", "EXEC"]
  });

  // shell-mode
  tools.define({
    name: "termShExec",
    description: "Run a shell command (/bin/sh -lc) inside a workspace.",
    parameters: {
      type: "object",
      required: ["ws", "command"],
      properties: {
        ws: { type: "string" },
        command: { type: "string" },
        cwd: { type: "string", default: "." },
        timeoutMs: { type: "integer", default: 120000 },
        env: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
        stdin: { type: "string", default: "" },
        maxOutputBytes: { type: "integer", default: 1000000 }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      const out = await svc.termShExec(args);
      if (logEntry) {
        try {
          logEntry({ method: "RPC", path: "termShExec", note: `${args.ws}:${args.cwd||"."} $ ${args.command}` });
        } catch {}
      }
      return out;
    },
    tags: ["TERMINAL", "SHELL", "EXEC"]
  });
}
