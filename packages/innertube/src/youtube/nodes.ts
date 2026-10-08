import type { ArtistRef, Thumbnail } from "@studio/music-core";

// Tolerant accessors over InnerTube JSON. Nothing here throws on a missing field.
export type Node = Record<string, any>;

export const obj = (v: unknown): Node | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : undefined;
export const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Walks a path of keys/indices; returns undefined as soon as a step is missing. */
export function dig(root: unknown, ...path: (string | number)[]): any {
  let cur: any = root;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

/** The single value of a `{ someRenderer: {...} }` wrapper, plus its key. */
export function unwrap(v: unknown): { key: string; node: Node } | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const key = Object.keys(o).find((k) => /Renderer$|ViewModel$|Model$/.test(k));
  return key ? { key, node: o[key] } : undefined;
}

export interface Run {
  text: string;
  navigationEndpoint?: Node;
}

export const runs = (v: unknown): Run[] =>
  arr(dig(v, "runs")).filter((r) => typeof r?.text === "string");

/** Text of `{runs}`, `{simpleText}` or `{content}` (view models). */
export function text(v: unknown): string {
  const o = obj(v);
  if (!o) return typeof v === "string" ? v : "";
  if (typeof o.simpleText === "string") return o.simpleText;
  if (typeof o.content === "string") return o.content;
  return runs(o)
    .map((r) => r.text)
    .join("");
}

const SEP = /^\s*[•·]\s*$/;

/** Splits runs at " • " separators into groups. */
export function groups(rs: Run[]): Run[][] {
  const out: Run[][] = [[]];
  for (const r of rs) {
    if (SEP.test(r.text)) out.push([]);
    else out[out.length - 1].push(r);
  }
  return out.filter((g) => g.length && g.some((r) => r.text.trim()));
}

export const browseOf = (
  nav: unknown,
): { browseId?: string; params?: string; pageType?: string } => {
  const b = obj(dig(nav, "browseEndpoint"));
  if (!b) return {};
  return {
    browseId: b.browseId,
    params: b.params,
    pageType: dig(
      b,
      "browseEndpointContextSupportedConfigs",
      "browseEndpointContextMusicConfig",
      "pageType",
    ),
  };
};

export const watchOf = (
  nav: unknown,
): {
  videoId?: string;
  playlistId?: string;
  videoType?: string;
  params?: string;
} => {
  const w =
    obj(dig(nav, "watchEndpoint")) ?? obj(dig(nav, "watchPlaylistEndpoint"));
  if (!w) return {};
  return {
    videoId: w.videoId,
    playlistId: w.playlistId,
    params: w.params,
    videoType: dig(
      w,
      "watchEndpointMusicSupportedConfigs",
      "watchEndpointMusicConfig",
      "musicVideoType",
    ),
  };
};

/** Finds the first `thumbnails` array in a subtree (depth-limited). */
export function thumbnails(v: unknown, depth = 6): Thumbnail[] {
  const o = obj(v);
  if (!o || depth < 0) return [];
  if (Array.isArray(o.thumbnails))
    return o.thumbnails
      .filter((t: any) => typeof t?.url === "string")
      .map(toThumb);
  if (Array.isArray(o.sources) && o.sources[0]?.url)
    return o.sources.map(toThumb);
  for (const k of Object.keys(o)) {
    if (k === "menu" || k === "navigationEndpoint") continue;
    const found = thumbnails(o[k], depth - 1);
    if (found.length) return found;
  }
  return [];
}

const toThumb = (t: any): Thumbnail => ({
  url: String(t.url).startsWith("//") ? `https:${t.url}` : String(t.url),
  width: Number(t.width) || 0,
  height: Number(t.height) || 0,
});

/** "3:22" or "1:02:03" → seconds. */
export function parseDuration(s: unknown): number | undefined {
  if (typeof s !== "string") return undefined;
  const m = s.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return undefined;
  return m[3]
    ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    : Number(m[1]) * 60 + Number(m[2]);
}

const ARTIST_PAGES = new Set([
  "MUSIC_PAGE_TYPE_ARTIST",
  "MUSIC_PAGE_TYPE_USER_CHANNEL",
]);
const LIST_SEP = /^\s*(,|&|and|×|x)\s*$/i;
const META =
  /^(\d[\d.,]*\s*[KMB]?\s+(views?|plays?|subscribers?|songs?|tracks?|monthly|listeners?)|.*monthly audience|\d{4}|\d+:\d{2}(:\d{2})?)$/i;
export const TYPE_LABELS = new Set([
  "Song",
  "Video",
  "Album",
  "Single",
  "EP",
  "Artist",
  "Playlist",
  "Episode",
  "Podcast",
  "Profile",
  "Station",
  "Audiobook",
]);

/** Artists from subtitle runs: linked artist runs first, else the first plain group. */
export function artistsFrom(rs: Run[]): ArtistRef[] {
  const linked = rs.filter((r) =>
    ARTIST_PAGES.has(browseOf(r.navigationEndpoint).pageType ?? ""),
  );
  if (linked.length)
    return linked.map((r) => ({
      id: browseOf(r.navigationEndpoint).browseId,
      name: r.text,
    }));
  for (const g of groups(rs)) {
    const t = g
      .map((r) => r.text)
      .join("")
      .trim();
    if (TYPE_LABELS.has(t) || META.test(t)) continue;
    if (g.some((r) => browseOf(r.navigationEndpoint).browseId)) continue;
    const names = g
      .filter((r) => !LIST_SEP.test(r.text))
      .map((r) => r.text.trim());
    return names.filter(Boolean).map((name) => ({ name }));
  }
  return [];
}

export function albumFrom(
  rs: Run[],
): { id: string; title: string } | undefined {
  const r = rs.find(
    (x) => browseOf(x.navigationEndpoint).pageType === "MUSIC_PAGE_TYPE_ALBUM",
  );
  const id = r && browseOf(r.navigationEndpoint).browseId;
  return r && id ? { id, title: r.text } : undefined;
}

export const yearFrom = (rs: Run[]): string | undefined =>
  rs.map((r) => r.text.trim()).find((t) => /^\d{4}$/.test(t));
export const durationFrom = (rs: Run[]): number | undefined => {
  for (const r of rs) {
    const d = parseDuration(r.text);
    if (d !== undefined) return d;
  }
  return undefined;
};

export const isExplicit = (...nodes: unknown[]): boolean =>
  nodes.some((n) =>
    arr(n).some(
      (b) =>
        dig(b, "musicInlineBadgeRenderer", "icon", "iconType") ===
        "MUSIC_EXPLICIT_BADGE",
    ),
  );

/** Continuation token in either the legacy `continuations` array or a trailing continuationItemRenderer. */
export function continuationOf(container: unknown): string | undefined {
  const legacy = dig(container, "continuations", 0);
  const token =
    dig(legacy, "nextContinuationData", "continuation") ??
    dig(legacy, "nextRadioContinuationData", "continuation");
  if (typeof token === "string") return token;
  const items = arr(dig(container, "contents"));
  return tokenOfItem(items[items.length - 1]);
}

export function tokenOfItem(item: unknown): string | undefined {
  const c = dig(item, "continuationItemRenderer");
  const t =
    dig(c, "continuationEndpoint", "continuationCommand", "token") ??
    dig(
      c,
      "button",
      "buttonRenderer",
      "command",
      "continuationCommand",
      "token",
    );
  return typeof t === "string" ? t : undefined;
}

export const decodeParam = (p: string | undefined): string | undefined => {
  if (!p) return undefined;
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};
