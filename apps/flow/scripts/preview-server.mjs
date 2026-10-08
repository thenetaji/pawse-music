// Serves a web export and proxies YouTube/JioSaavn calls for tunnel previews. Usage: node preview-server.mjs <dir> <port>
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

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
const allowed =
  /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|googlevideo\.com|jiosaavn\.com|kugou\.com|boidu\.dev)\//;

createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__proxy") {
    const target = u.searchParams.get("u") ?? "";
    if (!allowed.test(target)) return void res.writeHead(403).end();
    const body =
      req.method === "POST"
        ? await new Promise((r) => {
            const c = [];
            req.on("data", (d) => c.push(d));
            req.on("end", () => r(Buffer.concat(c)));
          })
        : undefined;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers))
      if (
        ![
          "host",
          "origin",
          "referer",
          "cookie",
          "accept-encoding",
          "connection",
          "content-length",
        ].includes(k) &&
        !k.startsWith("cf-") &&
        !k.startsWith("x-forwarded")
      )
        headers[k] = v;
    if (/music\.youtube\.com/.test(target))
      Object.assign(headers, {
        origin: "https://music.youtube.com",
        referer: "https://music.youtube.com/",
      });
    try {
      const r = await fetch(target, { method: req.method, headers, body });
      const out = Buffer.from(await r.arrayBuffer());
      res
        .writeHead(r.status, {
          "content-type":
            r.headers.get("content-type") ?? "application/octet-stream",
        })
        .end(out);
    } catch (e) {
      res.writeHead(502).end(String(e));
    }
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
