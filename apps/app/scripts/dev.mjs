// scripts/dev.mjs
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  watch as fsWatch,
} from "node:fs";
import { join, resolve } from "node:path";
import esbuild from "esbuild";
import chokidar from "chokidar";
import devConfig from "./dev.config.mjs";

const CLIENT_PORT = 5173;
const RELOAD_PORT = 35729;
const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const PUBLIC_DIR = join(DIST, "public");
const SRC = join(ROOT, "src");

// --- TUNABLES ---
const QUIET_FOR_MS = 800; // wait this long with NO changes before rebuilding
const WRITE_STABILITY_MS = 1000; // chokidar write-finish threshold for dist/ bursts

const broadcast = (wss, msg) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
};

function ensureIndexHtml() {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  copyFileSync(join(SRC, "index.html"), join(PUBLIC_DIR, "index.html"));
}

(async () => {
  //ensureIndexHtml();

  // Static dev server
  const app = createServer((req, res) => {
    let path = (req.url || "/").split("?")[0];
    if (path === "/") path = "/index.html";
    try {
      const body = readFileSync(join(PUBLIC_DIR, path));
      res.statusCode = 200;
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  app.listen(CLIENT_PORT, () =>
    console.log(`Dev static server http://localhost:${CLIENT_PORT}`)
  );

  const wss = new WebSocketServer({ port: RELOAD_PORT });
  console.log(`Live reload WS ws://localhost:${RELOAD_PORT}`);

  // Node server child with auto-restart
  let child;
  const restartServer = async () => {
    if (child) child.kill();
    const { spawn } = await import("node:child_process");
    child = spawn("node", ["dist/server.mjs"], { stdio: "inherit" });
  };

  // Build-notify plugins
  const clientNotify = {
    name: "client-notify",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors?.length)
          return console.error("Client rebuild failed.");
        broadcast(wss, { type: "reload" });
      });
    },
  };
  const serverNotify = {
    name: "server-notify",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors?.length)
          return console.error("Server rebuild failed.");
        await restartServer();
        broadcast(wss, { type: "server-restarted" });
      });
    },
  };

  // Initial builds
  await esbuild.build({
    entryPoints: ["src/app.js"],
    bundle: true,
    format: "esm",
    splitting: true,
    platform: "browser",
    outdir: "dist/public",
    logLevel: "info",
    sourcemap: true,
  });

  await esbuild.build({
    entryPoints: ["src/server.mjs"],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: "dist/server.mjs",
    logLevel: "info",
    packages: "external",
  });

  await restartServer();

  // Watch app sources via esbuild context
  const clientCtx = await esbuild.context({
    entryPoints: ["src/app.js"],
    bundle: true,
    format: "esm",
    splitting: true,
    platform: "browser",
    outdir: "dist/public",
    logLevel: "silent",
    sourcemap: true,
    plugins: [clientNotify],
  });
  await clientCtx.watch();

  const serverCtx = await esbuild.context({
    entryPoints: ["src/server.mjs"],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: "dist/server.mjs",
    logLevel: "silent",
    packages: "external",
    plugins: [serverNotify],
  });
  await serverCtx.watch();

  // Also watch index.html
  try {
    fsWatch(join(SRC, "index.html"), { persistent: true }, () => {
      ensureIndexHtml();
      broadcast(wss, { type: "reload" });
    });
  } catch {}

  // EXTRA DIR WATCH (monorepo package dists)
  const { watchDirs = [], ignore = [] } = devConfig || {};
  const absDirs = watchDirs.map((p) => resolve(ROOT, p));
  if (absDirs.length) {
    console.log("Watching extra dirs:", absDirs);

    let quietTimer = null;
    let rebuilding = false;

    const queueRebuild = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(async () => {
        if (rebuilding) return; // single-flight
        rebuilding = true;
        try {
          console.log("Rebuilding app after quiet period…");
          await clientCtx.rebuild();
          await serverCtx.rebuild();
          // plugins handle reload + restart
        } catch (e) {
          console.error("Rebuild error:", e);
        } finally {
          rebuilding = false;
        }
      }, QUIET_FOR_MS);
    };

    chokidar
      .watch(absDirs, {
        ignoreInitial: true,
        ignored: ignore,
        awaitWriteFinish: {
          stabilityThreshold: WRITE_STABILITY_MS,
          pollInterval: 50,
        },
      })
      .on("all", (_event, filePath) => {
        // Burst of writes -> one rebuild after quiescence
        // console.log("change:", _event, filePath);
        queueRebuild();
      });
  }
})();
