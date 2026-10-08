import {
  createResolver,
  JioSaavn,
  LyricsService,
  YouTubeMusic,
} from "@studio/innertube";
import type {
  CatalogItem,
  ResolvedStream,
  ResolveOptions,
  StreamResolver,
  Track,
} from "@studio/music-core";
import { logEvent } from "../lib/diagnostics";
import { appFetch } from "../lib/net";
import { useLibrary } from "./library";

const settings = () => useLibrary.getState().settings;
// "ZZ" (global) is a charts country, not a valid client region.
const gl = (region: string) => (region === "ZZ" ? "US" : region);

// One YouTube Music client for the app: cookies only when signed in, and only for catalog/account calls.
const raw = new YouTubeMusic({
  fetch: appFetch,
  hl: settings().language,
  gl: gl(settings().region),
  cookies: () => settings().cookies,
  onRequestError: (endpoint, e) =>
    logEvent("request-failed", `${endpoint}: ${(e as Error)?.message ?? e}`),
});
useLibrary.subscribe((s) =>
  raw.setLocale(s.settings.language, gl(s.settings.region)),
);

const FILTERED = new Set([
  "home",
  "homeMore",
  "search",
  "searchMore",
  "album",
  "artist",
  "playlist",
  "playlistMore",
  "browse",
  "upNext",
  "explore",
  "moodPage",
  "charts",
  "newReleases",
]);

const isExplicitItem = (x: unknown) =>
  !!x &&
  typeof x === "object" &&
  (x as Track).explicit === true &&
  ((x as CatalogItem).type === undefined ||
    (x as CatalogItem).type === "track");

/** Drops explicit tracks from catalog shapes (shelves, items, tracks, top, Shelf[]). */
export function dropExplicit<T>(v: T): T {
  if (Array.isArray(v))
    return v.filter((x) => !isExplicitItem(x)).map(dropExplicit) as T;
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o };
  for (const k of ["shelves", "items", "tracks"])
    if (Array.isArray(o[k])) out[k] = dropExplicit(o[k]);
  if (isExplicitItem(o.top)) out.top = undefined;
  return out as T;
}

/** The app's YouTube Music client; catalog results honour the explicit filter. */
export const yt: YouTubeMusic = new Proxy(raw, {
  get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (typeof value !== "function") return value;
    // Account calls (likedSongs uses playlist internally) bypass the filter.
    if (typeof key !== "string" || !FILTERED.has(key))
      return value.bind(target);
    return (...args: unknown[]) =>
      (value as (...a: unknown[]) => Promise<unknown>)
        .apply(target, args)
        .then((r) => (settings().explicitFilter ? dropExplicit(r) : r));
  },
});

/** Unfiltered client for account reads (sync, import), so the explicit filter never drops likes or playlist songs. */
export const ytAccount = raw;

export const saavn = new JioSaavn({ fetch: appFetch });
export const lyricsService = new LyricsService({ fetch: appFetch });

let localLookup: ((id: string) => ResolvedStream | undefined) | undefined;
/** Downloads register their lookup here so playback goes local-first. */
export function setLocalLookup(fn: (id: string) => ResolvedStream | undefined) {
  localLookup = fn;
}

const base = {
  youtube: raw,
  saavn,
  local: (id: string) => localLookup?.(id),
  quality: () => settings().quality,
};
const resolvers = {
  youtube: createResolver(base),
  saavn: createResolver({ ...base, preferSaavn: true }),
};

/** Local file first, then YouTube or JioSaavn per settings; pass `remoteOnly` to skip downloads. */
export const resolver: StreamResolver = {
  resolve: (t, o?: ResolveOptions) =>
    (settings().preferSaavn ? resolvers.saavn : resolvers.youtube).resolve(
      t,
      o,
    ),
};
