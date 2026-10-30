import {
  createResolver,
  JioSaavn,
  LyricsService,
  type ResolvableTrack,
  YouTubeMusic,
  YouTubeVideo,
} from "@pawse/innertube";
import type {
  CatalogItem,
  ResolvedStream,
  ResolveOptions,
  StreamResolver,
  Track,
} from "@pawse/music-core";
import { Platform } from "react-native";
import { opusNative, saavnMisses, withFormat } from "../lib/audio-format";
import { logEvent } from "../lib/diagnostics";
import { learnsFromWatching } from "../lib/learn";
import { languageCode, regionCode } from "../lib/locale";
import { appFetch } from "../lib/net";
import { effectiveQuality } from "../lib/quality";
import { getSetting } from "../lib/settings";
import { poTokenProvider, prewarmPoToken } from "../lib/po-token";
import { youtubeSandbox } from "../lib/youtube-sandbox";
import { useLibrary } from "./library";
import { kv } from "./storage";

const settings = () => useLibrary.getState().settings;
// "ZZ" (global) is a charts country, not a valid client region.
const gl = (region: string) => (region === "ZZ" ? "US" : region);
// One YouTube visitor id per install; the client swaps it only after a bot block.
const VISITOR_KEY = "pawse.visitorData";
const savedVisitor = kv.getItem(VISITOR_KEY);

// One YouTube Music client for the app: cookies only when signed in, and only for catalog/account calls.
const raw = new YouTubeMusic({
  fetch: appFetch,
  hl: languageCode(settings().language),
  gl: gl(regionCode(settings().region)),
  cookies: () => settings().cookies,
  // Incognito searches signed out, so YouTube keeps no record of them.
  privateSearch: () => !!settings().incognito,
  visitorData: typeof savedVisitor === "string" ? savedVisitor : undefined,
  onVisitorData: (v) => void kv.set(VISITOR_KEY, v).catch(() => {}),
  // JS-needing clients (n/sig solver) run in a hidden browser page; without one, only the older client list works.
  sandbox: youtubeSandbox,
  // BotGuard tokens for web_music, minted in that same page.
  poToken: poTokenProvider,
  clientsV2: !!youtubeSandbox,
  // Android (ExoPlayer) gets its own client order; it and browsers that decode WebM prefer Opus over AAC 128.
  // An iPhone can't read WebM: its Opus comes alongside the AAC and is repackaged (lib/opus-remux.ts).
  platform: Platform.OS,
  opus: opusNative,
  onRequestError: (endpoint, e) =>
    logEvent("request-failed", `${endpoint}: ${(e as Error)?.message ?? e}`),
});
prewarmPoToken();

// Kept per install: signed out, YouTube builds the feed for this visitor.
export const YT_VISITOR_KEY = "pawse.ytVisitor";
const savedYtVisitor = kv.getItem(YT_VISITOR_KEY);

// YouTube mode's catalog (www.youtube.com, Shorts already dropped), signed in with the same account.
export const ytv = new YouTubeVideo({
  visitorData: typeof savedYtVisitor === "string" ? savedYtVisitor : undefined,
  onVisitorData: (v) => void kv.set(YT_VISITOR_KEY, v).catch(() => {}),
  learn: learnsFromWatching,
  fetch: appFetch,
  hl: languageCode(settings().language),
  gl: gl(regionCode(settings().region)),
  cookies: () => settings().cookies ?? undefined,
  privateSearch: () => !!settings().incognito,
  originalAudio: () => getSetting("originalTitles", true),
  sandbox: youtubeSandbox,
  poToken: poTokenProvider,
  // Same as music: with the sandbox, web_music's PO token gets videos past a bot check on VISIONOS.
  clientsV2: !!youtubeSandbox,
  platform: Platform.OS,
});
useLibrary.subscribe((s) =>
  raw.setLocale(
    languageCode(s.settings.language),
    gl(regionCode(s.settings.region)),
  ),
);

const FILTERED = new Set([
  "home",
  "homeMore",
  "search",
  "searchMore",
  "searchSuggestions",
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

// A failed YouTube resolve logs each client's answer, so a bug report shows where it broke.
const youtube = {
  resolve: (t: Parameters<typeof raw.resolve>[0], o?: ResolveOptions) =>
    raw.resolve(t, o).catch((e: unknown) => {
      const tried = raw.lastResolveAttempts
        .map((a) => `${a.client} ${a.error ?? "ok"} ${a.ms}ms`)
        .join("; ");
      if (tried) logEvent("youtube-attempts", `${t.id}: ${tried}`);
      throw e;
    }),
};

const base = {
  youtube,
  saavn,
  local: (id: string) => localLookup?.(id),
  // Streaming quality follows the network; downloads pass their own.
  quality: () => effectiveQuality(),
};
const resolveSong = createResolver(base);

/** Local file first, then the copy Audio format asks for (JioSaavn 320 when certain, Opus, AAC); `remoteOnly` skips downloads. */
export const resolver: StreamResolver = {
  async resolve(t: ResolvableTrack, o?: ResolveOptions) {
    const opts = withFormat(o);
    const st = await resolveSong.resolve(t, opts);
    // JioSaavn is only tried first for songs at High quality; a YouTube answer then means it had no certain match.
    if (
      opts.saavn === "first" &&
      t.kind === "song" &&
      (opts.quality ?? effectiveQuality()) === "high" &&
      st.via !== "local"
    ) {
      if (st.via === "saavn") saavnMisses.delete(t.id);
      else saavnMisses.add(t.id);
    }
    return st;
  },
};
