// BotGuard challenge parsing. Create descramble and field layout ported from BgUtils by LuanRT (MIT,
// https://github.com/LuanRT/BgUtils); the homepage `ytAtN` source follows ReactTube's findings.

/** What the page needs to run BotGuard once. */
export interface BgChallenge {
  program: string;
  globalName: string;
  /** Absolute interpreter script URL, loaded with <script src>. */
  interpreterUrl?: string;
  /** Inline interpreter source (some Create answers carry it instead of a URL). */
  interpreterJs?: string;
  /** The page's ytcfg, set as `yt.config_` (BotGuard reads EVENT_ID from it). */
  ytcfg?: Record<string, unknown>;
}

export interface IntegrityToken {
  token: string;
  ttlSec: number;
}

// ytcfg values above this are player config, not BotGuard input (WEB_PLAYER_CONTEXT_CONFIGS is ~500 KB).
const YTCFG_VALUE_MAX = 64 * 1024;

/** Unescapes the body of a single-quoted JS string literal (`\xHH`, `\uHHHH`, `\n`, `\'`...). */
export function unescapeJs(s: string): string {
  const named: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
    v: "\v",
    "0": "\0",
  };
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (_, e) =>
    e.length > 1
      ? String.fromCharCode(parseInt(e.slice(1), 16))
      : (named[e] ?? e),
  );
}

/** Every `ytcfg.set({...})` object of a page merged, with oversized values dropped. */
export function extractYtcfg(html: string): Record<string, unknown> | undefined {
  let out: Record<string, unknown> | undefined;
  for (const m of html.matchAll(/ytcfg\.set\((\{[\s\S]+?\})\);/g)) {
    try {
      const o = JSON.parse(m[1]) as Record<string, unknown>;
      for (const [k, v] of Object.entries(o))
        if (JSON.stringify(v).length <= YTCFG_VALUE_MAX) (out ??= {})[k] = v;
    } catch {}
  }
  return out;
}

/** The homepage's attestation challenge (`window.ytAtN({R: '...'})`) and ytcfg; undefined on a consent page. */
export function parseHomepage(html: string): BgChallenge | undefined {
  const m = html.match(
    /window\.ytAtN\(\s*\{\s*['"]R['"]\s*:\s*'((?:[^'\\]|\\[\s\S])*)'/,
  );
  if (!m) return undefined;
  let bg: Record<string, unknown> | undefined;
  try {
    bg = (JSON.parse(unescapeJs(m[1])) as { bgChallenge?: typeof bg })
      .bgChallenge;
  } catch {
    return undefined;
  }
  const url = (
    bg?.interpreterUrl as
      | { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: unknown }
      | undefined
  )?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (
    typeof bg?.program !== "string" ||
    typeof bg.globalName !== "string" ||
    typeof url !== "string"
  )
    return undefined;
  return {
    program: bg.program,
    globalName: bg.globalName,
    interpreterUrl: absolute(url),
    ytcfg: extractYtcfg(html),
  };
}

/** Parses a `/api/jnn/v1/Create` answer (plain or scrambled). */
export function parseCreate(raw: unknown): BgChallenge | undefined {
  if (!Array.isArray(raw)) return undefined;
  let data: unknown;
  try {
    data =
      raw.length > 1 && typeof raw[1] === "string"
        ? JSON.parse(descramble(raw[1]))
        : raw[0];
  } catch {
    return undefined;
  }
  if (!Array.isArray(data)) return undefined;
  const [, script, url, , program, globalName] = data as unknown[];
  const firstString = (v: unknown) =>
    Array.isArray(v)
      ? (v.find((x) => typeof x === "string" && x) as string | undefined)
      : undefined;
  const js = firstString(script);
  const src = firstString(url);
  if (typeof program !== "string" || typeof globalName !== "string")
    return undefined;
  if (!js && !src) return undefined;
  return {
    program,
    globalName,
    ...(js ? { interpreterJs: js } : { interpreterUrl: absolute(src!) }),
  };
}

/** `GenerateIT` answers `[integrityToken, ttlSec, refreshSec, ...]`; a null token means BotGuard did not trust the page. */
export function parseIntegrityToken(raw: unknown): IntegrityToken | undefined {
  if (!Array.isArray(raw) || typeof raw[0] !== "string" || !raw[0])
    return undefined;
  const ttl = Number(raw[1]);
  return { token: raw[0], ttlSec: Number.isFinite(ttl) && ttl > 0 ? ttl : 0 };
}

/** Base64 (also the web-safe `-_.` alphabet) to bytes, then +97 per byte. */
export function descramble(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "="));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    bytes[i] = (bin.charCodeAt(i) + 97) & 0xff;
  if (typeof TextDecoder === "function") return new TextDecoder().decode(bytes);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

const absolute = (u: string) => (u.startsWith("//") ? `https:${u}` : u);
