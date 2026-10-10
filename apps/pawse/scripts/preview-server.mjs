// Serves a web export and relays YouTube/JioSaavn calls and audio for tunnel previews. Usage: node preview-server.mjs <dir> <port>
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";

import { relay } from "../../desktop/src/relay.mjs";

const root = process.argv[2];
const port = Number(process.argv[3] ?? 8733);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__proxy") {
    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await new Promise((r) => {
            const c = [];
            req.on("data", (d) => c.push(d));
            req.on("end", () => r(Buffer.concat(c)));
          });
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (typeof v === "string") headers.set(k, v);
    const out = await relay(
      new Request(`http://x${req.url}`, { method: req.method, headers, body }),
    );
    res.writeHead(out.status, Object.fromEntries(out.headers));
    if (!out.body) return void res.end();
    // A seek or skip drops the connection; stop reading upstream too.
    const stream = Readable.fromWeb(out.body).on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
    return;
  }
  let p = normalize(join(root, decodeURIComponent(u.pathname)));
  if (!p.startsWith(normalize(root))) return void res.writeHead(403).end();
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p) && existsSync(`${p}.html`)) p = `${p}.html`;
  if (!existsSync(p)) p = join(root, "index.html");
  res.writeHead(200, {
    "content-type": types[extname(p)] ?? "application/octet-stream",
  });
  createReadStream(p).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`preview on :${port}`));
