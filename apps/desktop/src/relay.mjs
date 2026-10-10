// The app's only door to the internet on desktop and in the web preview: YouTube and JioSaavn calls,
// plus audio streams with their headers and byte ranges. Works on fetch-style Request/Response.

// Keep in step with RELAYED in apps/pawse/src/lib/net.web.ts.
const ALLOWED =
  /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|googlevideo\.com|jiosaavn\.com|saavncdn\.com|kugou\.com|boidu\.dev|lrclib\.net|lyricsplus\.prjktla\.my\.id|lyricsplus\.binimum\.org|lyrics-plus-backend\.vercel\.app|lyricsplus\.atomix\.one)\//;
// Headers the browser adds that would give the app away or break the upstream request.
const DROP = new Set([
  "host",
  "origin",
  "referer",
  "cookie",
  "accept-encoding",
  "connection",
  "content-length",
]);
const PASS_BACK = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
];

/** Relays `/__proxy?u=<url>&h=<json headers>`; `fetchImpl` is Node's fetch or Electron's net.fetch. */
export async function relay(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const target = url.searchParams.get("u") ?? "";
  if (!ALLOWED.test(target))
    return new Response("not allowed", { status: 403 });
  const headers = {};
  request.headers.forEach((v, k) => {
    if (!DROP.has(k) && !k.startsWith("sec-") && !k.startsWith("x-forwarded"))
      headers[k] = v;
  });
  try {
    Object.assign(headers, JSON.parse(url.searchParams.get("h") ?? "{}"));
  } catch {}
  if (/^https:\/\/music\.youtube\.com\//.test(target))
    Object.assign(headers, {
      origin: "https://music.youtube.com",
      referer: "https://music.youtube.com/",
    });
  const method = request.method;
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : await request.arrayBuffer();
  try {
    const res = await fetchImpl(target, {
      method,
      headers,
      body,
      redirect: "follow",
    });
    const out = new Headers({ "cache-control": "no-store" });
    for (const k of PASS_BACK) {
      const v = res.headers.get(k);
      if (v) out.set(k, v);
    }
    // fetch already decoded gzip bodies, so the upstream length no longer matches.
    if (res.headers.get("content-encoding")) out.delete("content-length");
    return new Response(res.body, { status: res.status, headers: out });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
