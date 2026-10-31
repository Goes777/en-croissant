// Loopback-only application server. Account data stays outside the served files.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import { toNodeHandler } from "better-auth/node";
import { createLocalAuth } from "./local-auth.mjs";

const root = fileURLToPath(new URL("../dist-pwa/", import.meta.url));
const port = Number(process.env.CHESSPRATICA_PORT ?? 1431);
const baseURL = `http://127.0.0.1:${port}`;
const { auth, close } = await createLocalAuth({
  baseURL,
  dataDir:
    process.env.CHESSPRATICA_DATA_DIR ??
    join(process.env.LOCALAPPDATA ?? homedir(), "ChessPratica", "accounts"),
});
const handleAuth = toNodeHandler(auth);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};
const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/")) {
      response.setHeader("Cache-Control", "no-store");
      if (request.headers.host !== new URL(baseURL).host) {
        response.writeHead(400).end();
        return;
      }
      if (request.url.startsWith("/api/auth/")) {
        await handleAuth(request, response);
        return;
      }
      response.writeHead(404).end();
      return;
    }
    if (!["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(405).end();
      return;
    }
    let pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(root, "." + pathname);
    if (!file.startsWith(resolve(root) + sep) || !(await stat(file)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "A porta 1431 já está em uso. Confira http://127.0.0.1:1431/ ou feche o servidor anterior."
      : error.message,
  );
  process.exitCode = 1;
});
server.on("close", close);
server.requestTimeout = 30_000;
server.listen(port, "127.0.0.1", () =>
  console.log(`ChessPratica: ${baseURL}/\nContas e progresso locais.\nCtrl+C encerra o servidor.`),
);
