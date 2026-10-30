import {
  artistLine,
  type CatalogItem,
  type SearchFilter,
  type SearchSuggestions,
  type Shelf,
} from "@pawse/music-core";
import { useEffect, useRef, useState } from "react";

import { clock } from "../../components/video-card";
import { useLibrary } from "../../data/library";
import { kv } from "../../data/storage";
import { yt } from "../../lib/engine";
import { getSetting } from "../../lib/settings";
import { useResource } from "../../lib/use-resource";

export type Kind =
  | "all"
  | "songs"
  | "videos"
  | "albums"
  | "artists"
  | "playlists"
  | "channels";

/** The order sections and chips follow; videos and channels are YouTube's own, so they need videos on. */
export const KINDS: { id: Kind; label: string; youtube?: boolean }[] = [
  { id: "all", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "videos", label: "Videos", youtube: true },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
  { id: "playlists", label: "Playlists" },
  { id: "channels", label: "Channels", youtube: true },
];

/** YouTube Music's own filters; the other chips search YouTube. */
export const musicFilter = (
  c: Kind,
): Extract<
  SearchFilter,
  "songs" | "albums" | "artists" | "playlists"
> | null =>
  c === "songs" || c === "albums" || c === "artists" || c === "playlists"
    ? c
    : null;

export const itemTitle = (i: CatalogItem) =>
  i.type === "artist" ? i.name : i.title;

export function itemKind(i: CatalogItem): string {
  switch (i.type) {
    case "track":
      return i.kind === "video" ? "Video" : "Song";
    case "album":
      return i.kind === "single" ? "Single" : i.kind === "ep" ? "EP" : "Album";
    case "artist":
      return "Artist";
    case "playlist":
      return "Playlist";
  }
}

/** "Song · Daft Punk · 5:38": what it is, who from, then what tells it apart. */
export function itemSub(i: CatalogItem): string {
  const tail =
    i.type === "track"
      ? [artistLine(i.artists), clock(i.durationSec)]
      : i.type === "album"
        ? [artistLine(i.artists), i.year]
        : i.type === "artist"
          ? [i.subtitle?.replace(/^artist\s*[•·]\s*/i, "")]
          : [i.author, i.trackCount ? `${i.trackCount} songs` : undefined];
  return [itemKind(i), ...tail].filter(Boolean).join(" · ");
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Whether YouTube Music's best match is what was searched for, by name: "daft punk" and the artist Daft Punk. */
export function namesMatch(query: string, item?: CatalogItem): boolean {
  const q = plain(query);
  const n = item ? plain(itemTitle(item)) : "";
  return q.length >= 3 && n.length >= 3 && (n.includes(q) || q.includes(n));
}

/** Which chip a result belongs under. */
export const chipOf = (i: CatalogItem): Kind =>
  i.type === "track"
    ? i.kind === "video"
      ? "videos"
      : "songs"
    : i.type === "album"
      ? "albums"
      : i.type === "artist"
        ? "artists"
        : "playlists";

/** YouTube Music's shelves regrouped by kind, in one steady order whatever its layout or language. */
export function groupShelves(shelves: Shelf[]): Map<Kind, CatalogItem[]> {
  const by = new Map<Kind, CatalogItem[]>();
  const seen = new Set<string>();
  for (const it of shelves.flatMap((s) => s.items)) {
    const key = `${it.type}:${it.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = chipOf(it);
    by.set(c, [...(by.get(c) ?? []), it]);
  }
  return new Map(
    KINDS.filter((c) => by.has(c.id)).map((c) => [c.id, by.get(c.id) ?? []]),
  );
}

// What each past search looked like, so Recent can show artwork: kept on the side, since searches are only text.
const ART_KEY = "pawse.searchArt";
const ART_MAX = 40;
type Art = { url: string; kind: string; round?: boolean };
const loadArt = (): Record<string, Art> => {
  try {
    const raw = kv.getItem(ART_KEY);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
let art = loadArt();

export const searchArt = (q: string): Art | undefined => art[q.toLowerCase()];

/** Remembers the best match for a search, so its Recent row has a picture. */
export function rememberSearchArt(q: string, item: CatalogItem | undefined) {
  const url = item?.thumbnails.at(-1)?.url;
  if (!item || !url || getSetting("incognito", false)) return;
  const key = q.toLowerCase();
  if (art[key]?.url === url) return;
  const next = {
    ...art,
    [key]: {
      url,
      kind: itemKind(item),
      round: item.type === "artist" || undefined,
    },
  };
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - ART_MAX)))
    delete next[k];
  art = next;
  void kv.set(ART_KEY, JSON.stringify(art)).catch(() => {});
}

useLibrary.subscribe((s, prev) => {
  if (s.recentSearches.length || !prev.recentSearches.length) return;
  art = {};
  void kv.set(ART_KEY, "{}").catch(() => {});
});

const SUGGEST_MAX = 60;
const suggested = new Map<string, SearchSuggestions>();

/** Suggestions for what's typed: queries and artwork items together, each keystroke cancelling the one before it. */
export function useSuggestions(q: string, on: boolean) {
  const [got, setGot] = useState<{ q: string; data: SearchSuggestions }>();
  useEffect(() => {
    if (!on || !q || suggested.has(q)) return;
    const ctrl = new AbortController();
    yt.searchSuggestions(q, ctrl.signal)
      .then((data) => {
        suggested.set(q, data);
        if (suggested.size > SUGGEST_MAX)
          suggested.delete(suggested.keys().next().value as string);
        setGot({ q, data });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [q, on]);
  // The last answer stays up while the next one loads, so the list doesn't blink between keystrokes.
  if (!on || !q) return undefined;
  const hit = suggested.get(q);
  return hit ? { q, data: hit } : got;
}

export type Page<I> = { items: I[]; cont?: string };
const extras = new Map<
  string,
  { from: unknown; items: unknown[]; cont?: string }
>();
const EXTRAS_MAX = 30;

/** A list that loads page by page. Pages already fetched stay put when you switch chips and come back. */
export function usePaged<I>(
  key: string | null,
  idOf: (i: I) => string,
  first: () => Promise<Page<I>>,
  next: (cont: string) => Promise<Page<I>>,
) {
  const head = useResource<Page<I>>(key, first);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const saved = key ? extras.get(key) : undefined;
  const more = saved && saved.from === head.data ? saved : undefined;
  const cont = more ? more.cont : head.data?.cont;
  const seen = new Set<string>();
  const items = [
    ...(head.data?.items ?? []),
    ...((more?.items as I[]) ?? []),
  ].filter((i) => {
    const id = idOf(i);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const loadMore = () => {
    if (!key || !head.data || !cont || busy) return;
    setBusy(true);
    setFailed(false);
    const from = head.data;
    next(cont)
      .then((p) => {
        extras.set(key, {
          from,
          items: [...(more?.items ?? []), ...p.items],
          cont: p.cont,
        });
        if (extras.size > EXTRAS_MAX)
          extras.delete(extras.keys().next().value as string);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        setBusy(false);
        if (alive.current) bump((n) => n + 1);
      });
  };
  return {
    items,
    loading: head.loading && !head.data,
    error: head.error && !head.data ? head.error : undefined,
    reload: head.reload,
    loadingMore: busy,
    failedMore: failed,
    hasMore: !!cont,
    loadMore,
  };
}
