import * as path from "node:path";
import { spawn } from "node:child_process";
import { makeEnsureWs, safeJoin } from "./safety.js";

export function createTerminalService({ workspaces }) {
  const ensureWs = makeEnsureWs(workspaces);

  function clamp(n, lo, hi) {
    return Math.min(Math.max(n, lo), hi);
  }

  async function execWithSpawn({
    cmd,
    args = [],
    cwdAbs,
    shell = false,
    timeoutMs = 120_000,
    env = {},
    stdin = "",
    maxOutputBytes = 1_000_000,
  }) {
    const startedAt = Date.now();
    const opt = {
      cwd: cwdAbs,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      shell: false,
    };

    let spawnCmd = cmd;
    let spawnArgs = Array.isArray(args) ? args.slice() : [];
    if (shell) {
      spawnCmd = "/bin/sh";
      spawnArgs = ["-lc", cmd];
    }

    return await new Promise((resolve) => {
      const child = spawn(spawnCmd, spawnArgs, opt);

      let stdoutBuf = Buffer.alloc(0);
      let stderrBuf = Buffer.alloc(0);
      let stdoutTrunc = false;
      let stderrTrunc = false;

      const onData = (which) => (chunk) => {
        if (!chunk || !chunk.length) return;
        const cur = which === "out" ? stdoutBuf : stderrBuf;
        const next = Buffer.concat([cur, chunk], cur.length + chunk.length);
        if (next.length > maxOutputBytes) {
          if (which === "out") {
            stdoutBuf = next.subarray(0, maxOutputBytes);
            stdoutTrunc = true;
          } else {
            stderrBuf = next.subarray(0, maxOutputBytes);
            stderrTrunc = true;
          }
          if (which === "out") child.stdout?.removeAllListeners("data");
          else child.stderr?.removeAllListeners("data");
        } else {
          if (which === "out") stdoutBuf = next;
          else stderrBuf = next;
        }
      };

      child.stdout?.on("data", onData("out"));
      child.stderr?.on("data", onData("err"));

      let timedOut = false;
      const t = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGKILL"); } catch {}
      }, clamp(timeoutMs, 1000, 10 * 60 * 1000));

      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        try { child.stdin.end(); } catch {}
      }

      child.on("error", (err) => {
        clearTimeout(t);
        resolve({
          ok: false,
          error: err?.message || String(err),
          exitCode: null,
          signal: null,
          durationMs: Date.now() - startedAt,
        });
      });

      child.on("close", (code, signal) => {
        clearTimeout(t);
        resolve({
          ok: !timedOut && code === 0,
          exitCode: code,
          signal: signal || (timedOut ? "SIGKILL" : null),
          timedOut,
          stdout: stdoutBuf.toString("utf8"),
          stderr: stderrBuf.toString("utf8"),
          stdoutTruncated: stdoutTrunc,
          stderrTruncated: stderrTrunc,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  }

  async function termProcExec({
    ws,
    cmd,
    args = [],
    cwd = ".",
    timeoutMs = 120_000,
    env,
    stdin = "",
    maxOutputBytes = 1_000_000,
  }) {
    const { path: wsRoot } = ensureWs(ws);
    const cwdAbs = safeJoin(wsRoot, cwd || ".");
    return execWithSpawn({
      cmd, args, cwdAbs, shell: false, timeoutMs, env, stdin, maxOutputBytes,
    });
  }

  async function termShExec({
    ws,
    command,
    cwd = ".",
    timeoutMs = 120_000,
    env,
    stdin = "",
    maxOutputBytes = 1_000_000,
  }) {
    const { path: wsRoot } = ensureWs(ws);
    const cwdAbs = safeJoin(wsRoot, cwd || ".");
    return execWithSpawn({
      cmd: command, args: [], cwdAbs, shell: true, timeoutMs, env, stdin, maxOutputBytes,
    });
  }

  async function termWorkspaces() {
    return {
      workspaces: Object.entries(workspaces).map(([id, w]) => ({
        id, name: w.name, path: w.path, readOnly: !!w.readOnly,
      })),
    };
  }

  return { termProcExec, termShExec, termWorkspaces };
}
