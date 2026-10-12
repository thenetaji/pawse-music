// URL handling ported from yt-dlp's _video.py format loop (Unlicense): sig goes in `sp` (default "signature"), n is replaced in place.
import type { Challenges, Solved } from "./solver";

export interface CipheredFormat {
  url?: string;
  signatureCipher?: string;
  cipher?: string;
}

const decode = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
};

/** parse_qs: every value per key, in order (no URL/URLSearchParams, which React Native only half implements). */
export function parseQuery(qs: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of qs.replace(/^[?#]/, "").split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = decode(eq < 0 ? part : part.slice(0, eq));
    (out[k] ??= []).push(decode(eq < 0 ? "" : part.slice(eq + 1)));
  }
  return out;
}

export interface SignatureCipher {
  url: string;
  s: string;
  /** Query key for the solved signature. */
  sp: string;
}

export function parseSignatureCipher(
  cipher: string,
): SignatureCipher | undefined {
  const q = parseQuery(cipher);
  const url = q.url?.[0];
  const s = q.s?.[0];
  if (!url || !/^https?:\/\//.test(url) || !s) return undefined;
  return { url, s, sp: q.sp?.at(-1) || "signature" };
}

const queryOf = (url: string) => {
  const q = url.indexOf("?");
  return q < 0 ? "" : url.slice(q + 1).split("#")[0];
};

/** The n challenge in a media URL's query, if any. */
export const nChallengeOf = (url: string): string | undefined =>
  parseQuery(queryOf(url)).n?.[0] || undefined;

/** Media URL with the solved signature appended; plain URLs pass through. Undefined when unsolved. */
export function applySig(
  format: CipheredFormat | string,
  solved: Pick<Solved, "sig">,
): string | undefined {
  const f = typeof format === "string" ? { signatureCipher: format } : format;
  const cipher = f.signatureCipher ?? f.cipher;
  if (!cipher) return f.url;
  const sc = parseSignatureCipher(cipher);
  const sig = sc && solved.sig[sc.s];
  if (!sc || sig === undefined) return undefined;
  return `${sc.url}&${sc.sp}=${sig}`;
}

/** URL with `n` replaced by its solved value; unchanged when it has no n. Undefined when unsolved. */
export function applyN(
  url: string,
  solved: Pick<Solved, "n">,
): string | undefined {
  const n = nChallengeOf(url);
  if (n === undefined) return url;
  const out = solved.n[n];
  if (out === undefined) return undefined;
  const [head, hash] = url.split("#", 2);
  const q = head.indexOf("?");
  const params = head
    .slice(q + 1)
    .split("&")
    .map((p) =>
      decode(p.split("=", 1)[0]) === "n" ? `n=${encodeURIComponent(out)}` : p,
    );
  return `${head.slice(0, q)}?${params.join("&")}${hash !== undefined ? `#${hash}` : ""}`;
}

/** Every n and s challenge in a list of formats, for one solveChallenges call. */
export function challengesOf(formats: CipheredFormat[]): Required<Challenges> {
  const n = new Set<string>();
  const sig = new Set<string>();
  for (const f of formats) {
    const cipher = f.signatureCipher ?? f.cipher;
    const sc = cipher ? parseSignatureCipher(cipher) : undefined;
    if (sc) sig.add(sc.s);
    const url = sc?.url ?? f.url;
    const c = url && nChallengeOf(url);
    if (c) n.add(c);
  }
  return { n: [...n], sig: [...sig] };
}
