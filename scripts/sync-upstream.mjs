#!/usr/bin/env node
// Syncs yt-dlp's InnerTube clients and its pinned yt-dlp/ejs solver (both Unlicense) into Pawse; credits in NOTICE.md.
// Usage: pnpm sync:upstream [--dry-run]. Any unexpected upstream shape aborts before a file is written.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NIGHTLY_API =
  "https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest";
const RAW = "https://raw.githubusercontent.com";
const YT_DIR = "yt_dlp/extractor/youtube";
const EJS_ASSETS = {
  lib: "yt.solver.lib.min.js",
  core: "yt.solver.core.min.js",
};
const OVERRIDES = join(ROOT, "sources/innertube-overrides.json");
const CLIENTS_OUT = join(ROOT, "sources/innertube-clients-v2.json");
const VENDOR = join(ROOT, "packages/innertube/vendor/ejs");
// _video.py logs "YouTube is forcing SABR streaming" for these; they never return https URLs signed out.
const SABR_ONLY = new Set(["web", "web_safari"]);
// _video.py appends web_embedded for age-gated videos; it is not in _DEFAULT_CLIENTS.
const FALLBACKS = ["web_embedded"];
// Pawse's own PO-token provider (web page in the sandbox) serves these; every other client needing a GVS token is dropped.
const WEB_POT = ["web_music"];
// yt-dlp sends its own Chrome UA for web clients; the sandbox is Safari, so tokens and requests agree on this one.
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const DEFAULT_HOST = "www.youtube.com";
const DRY = process.argv.includes("--dry-run");

const fail = (msg) => {
  throw new Error(`sync-upstream: ${msg}`);
};

async function get(url, as = "text") {
  const res = await fetch(url, {
    headers: { "User-Agent": "pawse-sync-upstream" },
  });
  if (!res.ok) fail(`${res.status} for ${url}`);
  return as === "json"
    ? res.json()
    : Buffer.from(await res.arrayBuffer()).toString("utf8");
}

async function latestNightly() {
  const rel = await get(NIGHTLY_API, "json");
  const commit = /yt-dlp\/yt-dlp\/commit\/([0-9a-f]{40})/.exec(
    rel?.body ?? "",
  )?.[1];
  if (!rel?.tag_name || !commit)
    fail("nightly release has no tag or 'Generated from' commit");
  return { tag: rel.tag_name, commit };
}

function extract(commitSources) {
  const dir = mkdtempSync(join(tmpdir(), "pawse-ytdlp-"));
  try {
    const paths = Object.entries(commitSources).map(([name, text]) => {
      const p = join(dir, name);
      writeFileSync(p, text);
      return p;
    });
    const out = execFileSync(
      "python3",
      ["-I", join(ROOT, "scripts/ytdlp_clients.py"), ...paths],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
    return JSON.parse(out);
  } catch (e) {
    fail(`extractor failed: ${e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isScalar = (v) => typeof v === "string" || typeof v === "number";

/** yt-dlp client definition -> Pawse StreamClient (+ needs/thirdParty). */
function toPawse(key, c) {
  if (c.REQUIRE_AUTH) fail(`${key} requires sign-in`);
  const { clientName, clientVersion, hl, ...context } =
    c.INNERTUBE_CONTEXT.client;
  const userAgent =
    context.userAgent ?? (WEB_POT.includes(key) ? WEB_UA : undefined);
  delete context.userAgent;
  if (typeof userAgent !== "string") fail(`${key} has no userAgent`);
  for (const [k, v] of Object.entries(context))
    if (!isScalar(v)) fail(`${key}.context.${k} is not a string/number`);
  const extraContext = Object.keys(c.INNERTUBE_CONTEXT).filter(
    (k) => k !== "client" && k !== "thirdParty",
  );
  if (extraContext.length) fail(`${key} has context keys ${extraContext}`);
  const needs = [];
  if (c.REQUIRE_JS_PLAYER) needs.push("js");
  if (c.GVS_PO_TOKEN_POLICY.https.required) needs.push("pot");
  const host = c.INNERTUBE_HOST;
  if (!/^[a-z0-9.-]+$/.test(host)) fail(`${key} host ${host}`);
  return {
    name: key,
    clientName,
    clientNameId: c.INNERTUBE_CONTEXT_CLIENT_NAME,
    clientVersion,
    userAgent,
    context,
    ...(host !== DEFAULT_HOST
      ? { url: `https://${host}/youtubei/v1/player?prettyPrint=false` }
      : {}),
    ...(WEB_POT.includes(key)
      ? { headers: { Origin: `https://${host}`, Referer: `https://${host}/` } }
      : {}),
    ...(c.INNERTUBE_CONTEXT.thirdParty
      ? { thirdParty: c.INNERTUBE_CONTEXT.thirdParty }
      : {}),
    needs,
  };
}

function buildClients(data, overrides) {
  const chain = data.defaults._DEFAULT_CLIENTS;
  if (!Array.isArray(chain) || !chain.length) fail("empty _DEFAULT_CLIENTS");
  const keys = [
    ...WEB_POT,
    ...chain.filter((k) => !SABR_ONLY.has(k)),
    ...FALLBACKS,
  ];
  const out = [...new Set(keys)]
    .map((k) => {
      if (!data.clients[k]) fail(`client ${k} missing from INNERTUBE_CLIENTS`);
      return toPawse(k, data.clients[k]);
    })
    .filter((c) => {
      const drop = c.needs.includes("pot") && !WEB_POT.includes(c.name);
      if (drop) console.log(`dropping ${c.name}: needs a GVS PO token`);
      return !drop;
    });
  if (!Array.isArray(overrides?.clients)) fail("overrides.clients missing");
  for (const { after, ...o } of overrides.clients) {
    if (typeof o.name !== "string" || typeof o.clientName !== "string")
      fail(`bad override ${JSON.stringify(o).slice(0, 80)}`);
    const at = after ? out.findIndex((c) => c.name === after) : -1;
    if (after && at < 0) fail(`override ${o.name}: no client ${after}`);
    out.splice(at < 0 ? out.length : at + 1, 0, o);
  }
  return out;
}

const sha3 = (text) =>
  createHash("sha3-512").update(text, "utf8").digest("hex");

async function fetchEjs(ejs) {
  const { version, sha3_512: hashes } = ejs;
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`odd EJS version ${version}`);
  const files = {};
  for (const [k, name] of Object.entries(EJS_ASSETS)) {
    const want = hashes[name];
    if (!/^[0-9a-f]{128}$/.test(want ?? "")) fail(`no SHA3-512 for ${name}`);
    const text = await get(
      `https://github.com/yt-dlp/ejs/releases/download/${version}/${name}`,
    );
    const got = sha3(text);
    if (got !== want) fail(`${name} hash mismatch: ${got} != ${want}`);
    files[k] = text;
  }
  const header = /^\/\*![\s\S]*?\*\//.exec(files.lib)?.[0];
  if (!header?.includes("Bundled Dependencies"))
    fail("lib bundle lost its licence header");
  const license = await get(`${RAW}/yt-dlp/ejs/${version}/LICENSE`);
  if (!license.includes("unencumbered"))
    fail("EJS licence is no longer Unlicense");
  return { files, header, license };
}

const tsString = (attr, name, text) =>
  `// ${attr}\nexport const ${name} =\n  ${JSON.stringify(text)};\n`;

function vendorFiles(ejs, got) {
  const attr = `Generated by scripts/sync-upstream.mjs from yt-dlp/ejs ${ejs.version} (Unlicense). Do not edit.`;
  const sums = Object.fromEntries(
    Object.values(EJS_ASSETS).map((n) => [n, ejs.sha3_512[n]]),
  );
  const info = { version: ejs.version, sha3_512: sums };
  return {
    [join(VENDOR, "generated/lib.ts")]: tsString(
      attr,
      "EJS_LIB",
      got.files.lib,
    ),
    [join(VENDOR, "generated/core.ts")]: tsString(
      attr,
      "EJS_CORE",
      got.files.core,
    ),
    [join(VENDOR, "generated/info.ts")]:
      `// ${attr}\nexport const EJS_INFO = ${JSON.stringify(info, null, 2)} as const;\n`,
    [join(VENDOR, "info.json")]: `${JSON.stringify(info, null, 2)}\n`,
    [join(VENDOR, "LICENSE")]: got.license,
    [join(VENDOR, "THIRD_PARTY_LICENSES.txt")]: `${got.header}\n`,
    [join(VENDOR, "README.md")]: vendorReadme(ejs.version),
  };
}

const vendorReadme = (version) => `# yt-dlp/ejs ${version}

The YouTube signature / n challenge solver from [yt-dlp/ejs](https://github.com/yt-dlp/ejs) (Unlicense), pinned to the exact release and SHA3-512 hashes that yt-dlp pins in \`yt_dlp/extractor/youtube/jsc/_builtin/vendor/_info.py\`.

Everything here is written by \`pnpm sync:upstream\` (scripts/sync-upstream.mjs), which refuses assets whose hashes do not match. Do not edit by hand.

- \`generated/lib.ts\`, \`generated/core.ts\`: \`yt.solver.lib.min.js\` and \`yt.solver.core.min.js\` as string modules, so Metro and Electron bundle them without loaders.
- \`info.json\`, \`generated/info.ts\`: version and hashes.
- \`LICENSE\`: yt-dlp/ejs licence. \`THIRD_PARTY_LICENSES.txt\`: the lib bundle's header with meriyah (ISC) and astring (MIT) notices.
`;

function clientsFile(clients, provenance) {
  return {
    version: 2,
    note: "Signed-out player clients for Pawse builds that solve sig/n challenges. Generated by `pnpm sync:upstream` from yt-dlp's INNERTUBE_CLIENTS and default chain plus sources/innertube-overrides.json; do not edit by hand. `needs`: js = sig/n solving, pot = GVS PO token.",
    provenance,
    clients,
    android: clients,
  };
}

/** Writes every file via tmp + rename, so a failure mid-way never leaves a half-written file. */
function writeAll(files) {
  const staged = Object.entries(files).map(([path, text]) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.sync-tmp`, text);
    return path;
  });
  for (const p of staged) renameSync(`${p}.sync-tmp`, p);
}

// Only a change in clients or EJS pin rewrites the clients file; a new nightly alone does not.
const material = (json) =>
  JSON.stringify([json.clients, json.android, json.provenance?.ejs]);

async function main() {
  const ytdlp = await latestNightly();
  const src = async (p) => get(`${RAW}/yt-dlp/yt-dlp/${ytdlp.commit}/${p}`);
  const data = extract({
    "_base.py": await src(`${YT_DIR}/_base.py`),
    "_video.py": await src(`${YT_DIR}/_video.py`),
    "_info.py": await src(`${YT_DIR}/jsc/_builtin/vendor/_info.py`),
  });
  const clients = buildClients(
    data,
    JSON.parse(readFileSync(OVERRIDES, "utf8")),
  );
  const ejsGot = await fetchEjs(data.ejs);
  const provenance = {
    ytdlp,
    ejs: {
      version: data.ejs.version,
      sha3_512: Object.fromEntries(
        Object.values(EJS_ASSETS).map((n) => [n, data.ejs.sha3_512[n]]),
      ),
    },
    generated: new Date().toISOString(),
  };
  const next = clientsFile(clients, provenance);
  const files = vendorFiles(data.ejs, ejsGot);
  const prev = existsSync(CLIENTS_OUT)
    ? JSON.parse(readFileSync(CLIENTS_OUT, "utf8"))
    : undefined;
  if (!prev || material(prev) !== material(next))
    files[CLIENTS_OUT] = `${JSON.stringify(next, null, 2)}\n`;

  console.log(
    `yt-dlp ${ytdlp.tag} (${ytdlp.commit.slice(0, 9)}), EJS ${data.ejs.version} hashes ok`,
  );
  console.log(
    `chain: ${data.defaults._DEFAULT_CLIENTS.join(", ")} -> ${clients.map((c) => `${c.name}[${c.needs.join("+")}]`).join(", ")}`,
  );
  if (DRY) return console.log("dry run: nothing written");
  writeAll(files);
  for (const p of Object.keys(files))
    console.log(`wrote ${p.slice(ROOT.length + 1)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
