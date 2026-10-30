import {
  type Account,
  type AlbumDetail,
  type ArtistDetail,
  type Catalog,
  type ExploreFeed,
  type HomeFeed,
  type MoodTile,
  type PlaylistDetail,
  type PlaylistSummary,
  type ResolvedStream,
  type ResolveOptions,
  type SearchFilter,
  type SearchResults,
  type SearchSuggestions,
  type Shelf,
  StreamError,
  type StreamResolver,
  type Track,
  type UpNext,
} from "@pawse/music-core";

import {
  defaultFetch,
  type FetchLike,
  fetchWithRetry,
  fetchWithTimeout,
  parseCookies,
  query,
} from "../util/http";
import { sapisidAuthorization } from "./auth";
import { getPlayer } from "./challenge/player";
import {
  ClientsConfig,
  clientsKeyFor,
  DEFAULT_CLIENTS_CONFIG_URL,
  DEFAULT_CLIENTS_V2_CONFIG_URL,
  defaultStreamClients,
  type StreamClient,
} from "./clients";
import {
  MOOD_CATEGORY,
  moodParams,
  parseCharts,
  parseExplore,
  parseMoodPage,
  parseMoodsAndGenres,
  parseNewReleases,
} from "./explore";
import { THROTTLE_BYTES } from "./hls";
import { decodeParam } from "./nodes";
import {
  albumIdFromPlaylist,
  parseAlbum,
  parseArtist,
  parseBrowse,
  parseHome,
  parseLibraryPlaylists,
  parseLyricsBrowse,
  parseNext,
  parsePlaylist,
  parsePlaylistContinuation,
  parseRelated,
  parseSearch,
  parseSearchSuggestions,
} from "./parse";
import type { JsSandbox, PoTokenProvider } from "./sandbox";
import {
  isBotAnswer,
  type ResolveAttempt,
  resolveYouTubeStream,
  restingError,
} from "./stream";

export interface YouTubeMusicOptions {
  fetch?: FetchLike;
  hl?: string;
  gl?: string;
  /** Cookie header for music.youtube.com when signed in; only catalog/account calls use it. */
  cookies?: () => Promise<string | null> | string | null;
  /** The install's saved visitor id; YouTube sees one steady visitor instead of a new one per launch. */
  visitorData?: string;
  /** Called with each visitor id learned or rotated in, for the app to save. */
  onVisitorData?: (visitorData: string) => void;
  /** Remote stream-client list; null disables it. */
  clientsConfigUrl?: string | null;
  /** Built-in stream clients (default VISIONOS 1.02, 1.03, 1.01, then the native and music-host profiles). */
  streamClients?: StreamClient[];
  /** Solves YouTube's sig/n challenges (yt-dlp/ejs); without it clients that need JS are skipped. */
  sandbox?: JsSandbox;
  /** BotGuard PO tokens (see WebPoTokenProvider); without it clients that need a token are skipped. */
  poToken?: PoTokenProvider;
  /** Use the yt-dlp-generated client list (sources/innertube-clients-v2.json) and its built-in fallback. Only for builds that pass a `sandbox`: older builds drop ciphered formats. */
  clientsV2?: boolean;
  /** Platform.OS: picks the client list, and "android" prefers WebM/Opus. */
  platform?: string;
  /** The player decodes WebM/Opus (default: on Android); Opus then beats AAC 128. */
  opus?: boolean;
  /** Range-check the media URL before returning it (default true). */
  verifyStream?: boolean;
  /** Skip the range check when it takes longer than this (default 400 ms). */
  verifyBudgetMs?: number;
  /** Called once per catalog/account request that fails after retries. */
  onRequestError?: (endpoint: string, error: unknown) => void;
  /** True while searches should go out signed out, so they stay out of the account's search history (incognito). */
  privateSearch?: () => boolean;
}

export const ORIGIN = "https://music.youtube.com";
export const WEB_REMIX_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
export const FALLBACK_CLIENT_VERSION = "1.20261006.10.00";

/** Known `params` for filtered search. */
export const SEARCH_PARAMS: Record<Exclude<SearchFilter, "all">, string> = {
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA==",
  videos: "EgWKAQIQAWoKEAkQBRAKEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQBRAKEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQBRAKEAMQBA==",
  playlists: "EgWKAQIoAWoKEAkQBRAKEAMQBA==",
};

const TIMEOUT_MS = 12_000;
// Reads safe to send twice; writes (like/like) and playback reporting are never retried.
// Catalog lookups anyone can make go out signed out, so the account only shows up where it is needed.
const CATALOG_BROWSE =
  /^(UC|MPRE|MPLA|MPTR|MPLY|FEmusic_charts|FEmusic_moods_and_genres|FEmusic_new_releases)/;
const isCatalogCall = (endpoint: string, body: Record<string, unknown>) =>
  endpoint === "search" ||
  endpoint === "music/get_search_suggestions" ||
  (endpoint === "browse" &&
    typeof body.browseId === "string" &&
    CATALOG_BROWSE.test(body.browseId));
// Signed-in calls come at a person's pace: a burst of 8, then one every 2 s.
const ACCOUNT_BURST = 8;
const ACCOUNT_REFILL_MS = 2000;
// YouTube pushing back on the account (401/403/429) rests it for half an hour: no cookies, no writes.
const ACCOUNT_PUSHBACK = new Set([401, 403, 429]);
const ACCOUNT_REST_MS = 30 * 60_000;
const PLAYLIST_EDIT_BATCH = 50;

export type PlaylistPrivacy = "PUBLIC" | "UNLISTED" | "PRIVATE";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const IDEMPOTENT = new Set([
  "browse",
  "search",
  "next",
  "music/get_search_suggestions",
  "account/account_menu",
]);
const BOOTSTRAP_RETRY_MS = 5 * 60_000;
// A bot check rests stream resolving, longer each time in a row; a resolve that works resets it.
const YT_REST_MS = [15 * 60_000, 30 * 60_000, 60 * 60_000];
// A client that alone got a bot check sits out this long; the others keep playing.
const BENCH_MS = 30 * 60_000;
const VISITOR_ROTATE_MS = 3600_000;

interface WebConfig {
  clientVersion: string;
  visitorData?: string;
  apiKey?: string;
}

export class InnerTubeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "InnerTubeError";
    this.status = status;
  }
}

/** Reads INNERTUBE_CLIENT_VERSION, VISITOR_DATA and INNERTUBE_API_KEY from the web app's ytcfg. */
export function parseYtcfg(html: string): Partial<WebConfig> {
  const pick = (key: string) => {
    const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) return undefined;
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1];
    }
  };
  return {
    clientVersion: pick("INNERTUBE_CLIENT_VERSION"),
    visitorData: pick("VISITOR_DATA"),
    apiKey: pick("INNERTUBE_API_KEY"),
  };
}

const CPN_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const cpn = () =>
  Array.from(
    { length: 16 },
    () => CPN_ALPHABET[Math.floor(Math.random() * 64)],
  ).join("");
const hasSapisid = (c: string | null | undefined) => {
  if (!c) return false;
  const m = parseCookies(c);
  return !!(m.SAPISID || m["__Secure-3PAPISID"] || m["__Secure-1PAPISID"]);
};

/** YouTube Music over InnerTube: WEB_REMIX for catalog/account, a signed-out VISIONOS client chain for streams. */
export class YouTubeMusic implements Catalog, Account, StreamResolver {
  hl: string;
  gl: string;
  /** Per-client attempts of the last resolve(), for diagnostics. */
  lastResolveAttempts: ResolveAttempt[] = [];

  private readonly f: FetchLike;
  private readonly cookies?: YouTubeMusicOptions["cookies"];
  private readonly privateSearch?: YouTubeMusicOptions["privateSearch"];
  private readonly clients: ClientsConfig;
  private readonly sandbox?: JsSandbox;
  private readonly poToken?: PoTokenProvider;
  private readonly verify: boolean;
  private readonly verifyBudgetMs: number;
  private readonly opus: boolean;
  private readonly opusMaxBytes?: number;
  private readonly onRequestError?: YouTubeMusicOptions["onRequestError"];
  private readonly onVisitorData?: YouTubeMusicOptions["onVisitorData"];
  private web?: WebConfig;
  private webPending?: Promise<WebConfig>;
  private webFailedAt = 0;
  private signedIn = false;
  private visitorData?: string;
  private tokens = ACCOUNT_BURST;
  private refilledAt = Date.now();
  private paced: Promise<void> = Promise.resolve();
  private restUntil = 0;
  private readonly benched = new Map<string, number>();
  private readonly refusals = new Map<string, Map<string, number>>();
  private ytRestUntil = 0;
  private ytRests = 0;
  private visitorRotatedAt = 0;

  constructor(options: YouTubeMusicOptions = {}) {
    this.f = options.fetch ?? defaultFetch;
    this.hl = options.hl ?? "en";
    this.gl = options.gl ?? "US";
    this.cookies = options.cookies;
    this.visitorData = options.visitorData;
    this.verify = options.verifyStream ?? true;
    this.verifyBudgetMs = options.verifyBudgetMs ?? 1500;
    this.opus = options.opus ?? options.platform === "android";
    this.opusMaxBytes =
      options.platform === "android" ? THROTTLE_BYTES : undefined;
    this.onRequestError = options.onRequestError;
    this.privateSearch = options.privateSearch;
    this.onVisitorData = options.onVisitorData;
    const url =
      options.clientsConfigUrl === undefined
        ? options.clientsV2
          ? DEFAULT_CLIENTS_V2_CONFIG_URL
          : DEFAULT_CLIENTS_CONFIG_URL
        : options.clientsConfigUrl;
    this.sandbox = options.sandbox;
    this.poToken = options.poToken;
    this.clients = new ClientsConfig(
      this.f,
      url,
      options.streamClients ??
        defaultStreamClients(options.platform, options.clientsV2),
      clientsKeyFor(options.platform),
    );
    void this.cookie().catch(() => undefined);
  }

  /** Feed language and region for later calls; drops the cached ytcfg when the language changes. */
  setLocale(hl: string, gl: string): void {
    if (hl === this.hl && gl === this.gl) return;
    if (hl !== this.hl) {
      this.web = undefined;
      this.webFailedAt = 0;
    }
    this.hl = hl;
    this.gl = gl;
  }

  /** Preloads ytcfg and the stream-client list so the first call is fast. */
  async warmup(): Promise<void> {
    await Promise.all([this.config(), this.clients.get()]);
  }

  isSignedIn(): boolean {
    return this.signedIn;
  }

  private async cookie(): Promise<string | null> {
    const c = (await this.cookies?.()) ?? null;
    this.signedIn = hasSapisid(c);
    return this.signedIn && Date.now() >= this.restUntil ? c : null;
  }

  /** Waits for a turn in the signed-in budget; turns are handed out one at a time. */
  private pace(): Promise<void> {
    const turn = this.paced.then(async () => {
      const now = Date.now();
      this.tokens = Math.min(
        ACCOUNT_BURST,
        this.tokens + (now - this.refilledAt) / ACCOUNT_REFILL_MS,
      );
      this.refilledAt = now;
      if (this.tokens < 1) {
        await wait((1 - this.tokens) * ACCOUNT_REFILL_MS);
        this.tokens = 1;
        this.refilledAt = Date.now();
      }
      this.tokens -= 1;
    });
    this.paced = turn;
    return turn;
  }

  private async config(): Promise<WebConfig> {
    if (this.web) return this.web;
    if (
      this.webFailedAt &&
      Date.now() - this.webFailedAt < BOOTSTRAP_RETRY_MS
    ) {
      return {
        clientVersion: FALLBACK_CLIENT_VERSION,
        visitorData: this.visitorData,
      };
    }
    this.webPending ??= this.bootstrap().finally(() => {
      this.webPending = undefined;
    });
    return this.webPending;
  }

  private async bootstrap(): Promise<WebConfig> {
    try {
      const res = await fetchWithRetry(
        this.f,
        `${ORIGIN}/`,
        {
          headers: {
            "User-Agent": WEB_REMIX_UA,
            "Accept-Language": this.acceptLanguage(),
            Cookie: "SOCS=CAI",
          },
          credentials: "omit",
        },
        TIMEOUT_MS,
      );
      const cfg = parseYtcfg(await res.text());
      if (!cfg.clientVersion) throw new Error("ytcfg missing");
      this.web = {
        clientVersion: cfg.clientVersion,
        visitorData: this.visitorData,
        apiKey: cfg.apiKey,
      };
      this.learnVisitor(cfg.visitorData);
      return this.web;
    } catch {
      this.webFailedAt = Date.now();
      return {
        clientVersion: FALLBACK_CLIENT_VERSION,
        visitorData: this.visitorData,
      };
    }
  }

  private acceptLanguage() {
    return this.hl === "en" ? "en-US,en;q=0.9" : `${this.hl},en;q=0.8`;
  }

  private context(cfg: WebConfig) {
    return {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: cfg.clientVersion,
        hl: this.hl,
        gl: this.gl,
        ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
        userAgent: WEB_REMIX_UA,
        platform: "DESKTOP",
        osName: "Macintosh",
        osVersion: "10_15_7",
        browserName: "Safari",
        browserVersion: "26.0",
        originalUrl: `${ORIGIN}/`,
      },
      user: { lockedSafetyMode: false },
    };
  }

  private async webHeaders(
    cfg: WebConfig,
    cookie: string | null,
  ): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      "User-Agent": WEB_REMIX_UA,
      "Accept-Language": this.acceptLanguage(),
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      "X-YouTube-Client-Name": "67",
      "X-YouTube-Client-Version": cfg.clientVersion,
    };
    if (cfg.visitorData) h["X-Goog-Visitor-Id"] = cfg.visitorData;
    if (cookie) {
      h.Cookie = cookie;
      h["X-Goog-AuthUser"] = "0";
      h["X-Origin"] = ORIGIN;
      const auth = sapisidAuthorization(cookie, ORIGIN);
      if (auth) h.Authorization = auth;
    }
    return h;
  }

  /**
   * POST to a WEB_REMIX endpoint, signed in when cookies are available.
   * `account` also signs in catalog calls, `paced: false` skips the signed-in budget, `signal` cancels the request.
   */
  async call(
    endpoint: string,
    body: Record<string, unknown>,
    opts: { account?: boolean; paced?: boolean; signal?: AbortSignal } = {},
  ): Promise<any> {
    const [cfg, cookie] = await Promise.all([
      this.config(),
      isCatalogCall(endpoint, body) && !opts.account
        ? null
        : this.cookie().catch(() => null),
    ]);
    if (cookie && opts.paced !== false) await this.pace();
    const headers = {
      ...(await this.webHeaders(cfg, cookie)),
      "Content-Type": "application/json",
    };
    let json: any;
    try {
      const res = await fetchWithRetry(
        this.f,
        `${ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ context: this.context(cfg), ...body }),
          credentials: "omit",
          signal: opts.signal,
        },
        TIMEOUT_MS,
        // A signed-in call is never repeated: retrying a 429 is what gets accounts flagged.
        !cookie && IDEMPOTENT.has(endpoint) ? 1 : 0,
      );
      if (cookie && ACCOUNT_PUSHBACK.has(res.status)) {
        this.restUntil = Date.now() + ACCOUNT_REST_MS;
        this.onRequestError?.(
          "account",
          new Error(`resting 30 min after HTTP ${res.status} on ${endpoint}`),
        );
      }
      if (!res.ok)
        throw new InnerTubeError(
          res.status,
          `InnerTube ${endpoint} HTTP ${res.status}`,
        );
      json = await res.json();
    } catch (e) {
      this.onRequestError?.(endpoint, e);
      throw e;
    }
    this.learnVisitor(json?.responseContext?.visitorData);
    return json;
  }

  /** Takes YouTube's visitor id when none is held (first launch, or after a rotation). */
  private learnVisitor(vd: unknown): void {
    if (this.visitorData || typeof vd !== "string" || !vd) return;
    this.visitorData = vd;
    if (this.web) this.web = { ...this.web, visitorData: vd };
    this.onVisitorData?.(vd);
  }

  /** After a bot block, drops the visitor id so the next answer brings a fresh one; at most once an hour. */
  private rotateVisitor(): void {
    const now = Date.now();
    if (!this.visitorData || now - this.visitorRotatedAt < VISITOR_ROTATE_MS)
      return;
    this.visitorRotatedAt = now;
    this.visitorData = undefined;
    if (this.web) this.web = { ...this.web, visitorData: undefined };
  }

  /** True while stream resolving rests after a bot check. */
  isYouTubeResting(): boolean {
    return Date.now() < this.ytRestUntil;
  }

  private browseRaw(browseId: string, params?: string) {
    return this.call("browse", {
      browseId,
      ...(params ? { params: decodeParam(params) } : {}),
    });
  }

  // Catalog

  async home(params?: string): Promise<HomeFeed> {
    return parseHome(await this.browseRaw("FEmusic_home", params));
  }

  async homeMore(continuation: string): Promise<HomeFeed> {
    const feed = parseHome(await this.call("browse", { continuation }));
    return { ...feed, chips: [] };
  }

  /** Search and suggestions go out as the account when there is one, for YouTube's own ranking; any trouble falls back to signed out, and incognito never signs in. */
  private async searchCall(
    endpoint: string,
    body: Record<string, unknown>,
    opts: { paced?: boolean; signal?: AbortSignal } = {},
  ): Promise<any> {
    const { signal } = opts;
    if (this.privateSearch?.()) return this.call(endpoint, body, { signal });
    try {
      return await this.call(endpoint, body, { ...opts, account: true });
    } catch (e) {
      if (signal?.aborted || !this.signedIn) throw e;
      return this.call(endpoint, body, { signal });
    }
  }

  async search(
    q: string,
    filter: SearchFilter = "all",
  ): Promise<SearchResults> {
    const params = filter === "all" ? undefined : SEARCH_PARAMS[filter];
    return parseSearch(
      await this.searchCall("search", {
        query: q,
        ...(params ? { params } : {}),
      }),
      filter,
    );
  }

  /** Next page of a filtered search. */
  async searchMore(continuation: string): Promise<SearchResults> {
    return parseSearch(
      await this.searchCall("search", { continuation }),
      "songs",
    );
  }

  async suggestions(q: string): Promise<string[]> {
    return (await this.searchSuggestions(q)).queries;
  }

  /** Typed-ahead queries plus the songs, artists and albums YouTube Music suggests straight away. */
  async searchSuggestions(
    q: string,
    signal?: AbortSignal,
  ): Promise<SearchSuggestions> {
    // Suggestions are light reads, so they skip the signed-in budget a fast typist would use up.
    return parseSearchSuggestions(
      await this.searchCall(
        "music/get_search_suggestions",
        { input: q },
        { paced: false, signal },
      ),
    );
  }

  async album(id: string): Promise<AlbumDetail> {
    const bare = id.startsWith("VL") ? id.slice(2) : id;
    if (bare.startsWith("OLAK")) {
      const page = await this.browseRaw(`VL${bare}`);
      const albumId = albumIdFromPlaylist(page);
      if (albumId) return this.album(albumId);
      const p = parsePlaylist(page, bare);
      return {
        id: bare,
        title: p.title,
        artists: p.author ? [{ name: p.author }] : [],
        thumbnails: p.thumbnails,
        tracks: p.tracks,
        playlistId: bare,
      };
    }
    return parseAlbum(await this.browseRaw(bare), bare);
  }

  async artist(id: string): Promise<ArtistDetail> {
    return parseArtist(await this.browseRaw(id), id);
  }

  async playlist(id: string): Promise<PlaylistDetail> {
    const browseId = id.startsWith("VL") ? id : `VL${id}`;
    return parsePlaylist(await this.browseRaw(browseId), browseId);
  }

  async playlistMore(continuation: string): Promise<PlaylistDetail> {
    const { tracks, continuation: next } = parsePlaylistContinuation(
      await this.call("browse", { continuation }),
    );
    return { id: "", title: "", thumbnails: [], tracks, continuation: next };
  }

  async browse(token: string): Promise<Shelf[]> {
    if (token.startsWith("search|")) {
      const [, q, params] = token.split("|");
      const res = parseSearch(
        await this.call("search", {
          query: q,
          ...(params ? { params: decodeParam(params) } : {}),
        }),
        "songs",
      );
      return [{ title: q, items: res.items ?? [], more: undefined }];
    }
    const [browseId, params] = token.split("|");
    return parseBrowse(await this.browseRaw(browseId, params));
  }

  // Explore

  async explore(): Promise<ExploreFeed> {
    return parseExplore(await this.browseRaw("FEmusic_explore"));
  }

  async moodsAndGenres(): Promise<MoodTile[]> {
    return parseMoodsAndGenres(
      await this.browseRaw("FEmusic_moods_and_genres"),
    );
  }

  /** Playlists for a mood or genre tile; takes MoodTile.params or the raw params. */
  async moodPage(params: string): Promise<Shelf[]> {
    return parseMoodPage(
      await this.browseRaw(MOOD_CATEGORY, moodParams(params)),
    );
  }

  private chartsRaw(country: string) {
    return this.call("browse", {
      browseId: "FEmusic_charts",
      formData: { selectedValues: [country] },
    }).then((j) => parseCharts(j, country));
  }

  /** Charts shelves for an ISO country code; "ZZ" is global. */
  async charts(country = "ZZ"): Promise<Shelf[]> {
    return (await this.chartsRaw(country)).shelves;
  }

  /** Countries the charts page offers (includes Global as ZZ). */
  async chartsCountries(): Promise<{ code: string; title: string }[]> {
    return (await this.chartsRaw("ZZ")).countries;
  }

  async newReleases(): Promise<Shelf[]> {
    return parseNewReleases(
      await this.browseRaw("FEmusic_new_releases_albums"),
    );
  }

  async upNext(input: {
    videoId?: string;
    playlistId?: string;
    continuation?: string;
  }): Promise<UpNext> {
    const playlistId =
      input.playlistId ??
      (input.videoId ? `RDAMVM${input.videoId}` : undefined);
    return parseNext(
      await this.call("next", {
        ...(input.videoId ? { videoId: input.videoId } : {}),
        ...(playlistId ? { playlistId } : {}),
        ...(input.continuation ? { continuation: input.continuation } : {}),
        isAudioOnly: true,
        enablePersistentPlaylistPanel: true,
        tunerSettingValue: "AUTOMIX_SETTING_NORMAL",
      }),
    );
  }

  /** A song's Related tab; takes a videoId or the MPTR id from upNext().relatedBrowseId. */
  async related(id: string): Promise<Shelf[]> {
    const browseId = id.startsWith("MPTR")
      ? id
      : (await this.upNext({ videoId: id })).relatedBrowseId;
    return browseId ? parseRelated(await this.browseRaw(browseId)) : [];
  }

  /** Unsynced lyrics text for an MPLY browse id from upNext. */
  async lyricsText(lyricsBrowseId: string): Promise<string | undefined> {
    return parseLyricsBrowse(await this.browseRaw(lyricsBrowseId));
  }

  // Account

  private async requireCookie(): Promise<string> {
    const c = await this.cookie();
    if (!c) throw new Error("Not signed in to YouTube Music");
    return c;
  }

  async rate(
    videoId: string,
    rating: "like" | "dislike" | "none",
  ): Promise<void> {
    await this.requireCookie();
    const ep =
      rating === "like"
        ? "like/like"
        : rating === "dislike"
          ? "like/dislike"
          : "like/removelike";
    await this.call(ep, { target: { videoId } });
  }

  /** Subscribes to (or leaves) an artist's channel on the signed-in account. */
  async subscribe(channelId: string, on: boolean): Promise<void> {
    await this.requireCookie();
    await this.call(
      on ? "subscription/subscribe" : "subscription/unsubscribe",
      { channelIds: [channelId] },
    );
  }

  /** Adds videos to one of the account's playlists, up to 50 per request; duplicates are skipped. */
  async addToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
    const ids = [...new Set(videoIds)];
    for (let i = 0; i < ids.length; i += PLAYLIST_EDIT_BATCH)
      await this.editPlaylist(
        playlistId,
        ids.slice(i, i + PLAYLIST_EDIT_BATCH).map((addedVideoId) => ({
          action: "ACTION_ADD_VIDEO",
          addedVideoId,
          dedupeOption: "DEDUPE_OPTION_SKIP",
        })),
      );
  }

  /** Removes playlist entries by the setVideoId their rows carry, up to 50 per request. */
  async removeFromPlaylist(
    playlistId: string,
    items: { videoId: string; setVideoId: string }[],
  ): Promise<void> {
    for (let i = 0; i < items.length; i += PLAYLIST_EDIT_BATCH)
      await this.editPlaylist(
        playlistId,
        items
          .slice(i, i + PLAYLIST_EDIT_BATCH)
          .map(({ videoId, setVideoId }) => ({
            action: "ACTION_REMOVE_VIDEO",
            setVideoId,
            removedVideoId: videoId,
          })),
      );
  }

  /** Moves a playlist entry before another one, or to the end when `before` is omitted. Both are setVideoIds. */
  async movePlaylistItem(
    playlistId: string,
    setVideoId: string,
    before?: string,
  ): Promise<void> {
    await this.editPlaylist(playlistId, [
      {
        action: "ACTION_MOVE_VIDEO_BEFORE",
        setVideoId,
        ...(before ? { movedSetVideoIdSuccessor: before } : {}),
      },
    ]);
  }

  async renamePlaylist(playlistId: string, name: string): Promise<void> {
    await this.editPlaylist(playlistId, [
      { action: "ACTION_SET_PLAYLIST_NAME", playlistName: name },
    ]);
  }

  /** An empty description clears it. */
  async setPlaylistDescription(
    playlistId: string,
    description: string,
  ): Promise<void> {
    await this.editPlaylist(playlistId, [
      {
        action: "ACTION_SET_PLAYLIST_DESCRIPTION",
        playlistDescription: description,
      },
    ]);
  }

  async setPlaylistPrivacy(
    playlistId: string,
    privacy: PlaylistPrivacy,
  ): Promise<void> {
    await this.editPlaylist(playlistId, [
      { action: "ACTION_SET_PLAYLIST_PRIVACY", playlistPrivacy: privacy },
    ]);
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    await this.requireCookie();
    const json = await this.call("playlist/delete", {
      playlistId: playlistId.replace(/^VL/, ""),
    });
    // A successful delete may come back without a status; only an explicit refusal is an error.
    if (json?.status && json.status !== "STATUS_SUCCEEDED")
      throw new Error(`YouTube Music playlist delete failed (${json.status})`);
  }

  private async editPlaylist(
    playlistId: string,
    actions: Record<string, string>[],
  ): Promise<void> {
    await this.requireCookie();
    const json = await this.call("browse/edit_playlist", {
      // Library browse ids carry a "VL" prefix the edit endpoint does not take.
      playlistId: playlistId.replace(/^VL/, ""),
      actions,
    });
    if (json?.status !== "STATUS_SUCCEEDED")
      throw new Error(
        `YouTube Music playlist edit failed (${json?.status ?? "no status"})`,
      );
  }

  /** Who YouTube thinks is signed in; null when the session isn't accepted. */
  async accountInfo(): Promise<{
    name: string;
    handle?: string;
    photo?: string;
  } | null> {
    if (!(await this.cookie())) return null;
    const json = await this.call("account/account_menu", {});
    const header =
      json?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header
        ?.activeAccountHeaderRenderer;
    const name =
      header?.accountName?.runs?.[0]?.text ?? header?.accountName?.simpleText;
    if (!name) return null;
    const thumbs = header?.accountPhoto?.thumbnails;
    return {
      name,
      handle: header?.channelHandle?.runs?.[0]?.text,
      photo:
        Array.isArray(thumbs) && thumbs.length
          ? thumbs[thumbs.length - 1].url
          : undefined,
    };
  }

  async likedSongs(): Promise<PlaylistDetail> {
    await this.requireCookie();
    return this.playlist("LM");
  }

  async libraryPlaylists(): Promise<PlaylistSummary[]> {
    await this.requireCookie();
    return parseLibraryPlaylists(
      await this.browseRaw("FEmusic_liked_playlists"),
    );
  }

  /** Registers a play in YouTube history the way the web player does; never throws. */
  async reportPlayback(
    videoId: string,
    playedSec: number,
    lengthSec: number,
  ): Promise<void> {
    try {
      const cookie = await this.cookie();
      if (!cookie) return;
      // Without the web player's signature timestamp YouTube answers "The page needs to be reloaded".
      const { sts } = await getPlayer(this.f);
      const player = await this.call("player", {
        videoId,
        racyCheckOk: true,
        contentCheckOk: true,
        playbackContext: {
          contentPlaybackContext: {
            html5Preference: "HTML5_PREF_WANTS",
            signatureTimestamp: sts,
          },
        },
      });
      const tracking = player?.playbackTracking;
      const playbackUrl: string | undefined =
        tracking?.videostatsPlaybackUrl?.baseUrl;
      const watchtimeUrl: string | undefined =
        tracking?.videostatsWatchtimeUrl?.baseUrl;
      if (!playbackUrl) return;
      const cfg = await this.config();
      const headers = await this.webHeaders(cfg, cookie);
      const base = {
        ver: 2,
        c: "WEB_REMIX",
        cver: cfg.clientVersion,
        cpn: cpn(),
      };
      const get = async (
        url: string,
        extra: Record<string, string | number>,
      ) => {
        await this.pace();
        return fetchWithTimeout(
          this.f,
          `${url}${url.includes("?") ? "&" : "?"}${query({ ...base, ...extra })}`,
          { headers, credentials: "omit" },
          TIMEOUT_MS,
        );
      };
      await get(playbackUrl, {});
      if (watchtimeUrl && playedSec > 0) {
        const et = Math.min(playedSec, lengthSec || playedSec).toFixed(3);
        await get(watchtimeUrl, {
          st: "0.000",
          et,
          cmt: et,
          len: lengthSec.toFixed(3),
          final: 1,
          state: "paused",
        });
      }
    } catch {
      // Play history is best-effort bookkeeping.
    }
  }

  /** A client whose media links 403 on two different songs sits out like a bot-checked one. */
  private noteRefusals(trackId: string): void {
    const now = Date.now();
    for (const a of this.lastResolveAttempts) {
      if (!/media url answered 403/.test(a.error ?? "")) continue;
      const via = `youtube:${a.client}`;
      const hits = this.refusals.get(via) ?? new Map<string, number>();
      for (const [id, at] of hits) if (now - at > BENCH_MS) hits.delete(id);
      hits.set(trackId, now);
      this.refusals.set(via, hits);
      if (hits.size >= 2) this.benched.set(via, now + BENCH_MS);
    }
  }

  // StreamResolver

  async resolve(
    track: Pick<Track, "id" | "source" | "title" | "artists" | "durationSec">,
    options: ResolveOptions = {},
  ): Promise<ResolvedStream> {
    if (track.source !== "youtube")
      throw new StreamError(
        "unplayable",
        `YouTube cannot resolve a ${track.source} track`,
      );
    if (this.isYouTubeResting()) {
      this.lastResolveAttempts = [];
      throw restingError();
    }
    const clients = await this.clients.get();
    this.lastResolveAttempts = [];
    const now = Date.now();
    for (const [via, until] of this.benched)
      if (until <= now) this.benched.delete(via);
    try {
      const stream = await resolveYouTubeStream(
        track.id,
        {
          fetch: this.f,
          clients,
          hl: this.hl,
          gl: this.gl,
          visitorData: this.visitorData,
          verify: this.verify,
          verifyBudgetMs: this.verifyBudgetMs,
          quality: options.quality,
          opus: this.opus,
          opusMaxBytes: this.opusMaxBytes,
          exclude: [...(options.exclude ?? []), ...this.benched.keys()],
          avoid: options.avoid,
          onBot: (via) => this.benched.set(via, Date.now() + BENCH_MS),
          sandbox: this.sandbox,
          poToken: this.poToken,
        },
        this.lastResolveAttempts,
      );
      this.ytRests = 0;
      this.noteRefusals(track.id);
      return stream;
    } catch (e) {
      this.noteRefusals(track.id);
      // Rest only when the IP looks flagged: two clients said bot, or every client tried did.
      const bots = this.lastResolveAttempts.filter((a) =>
        /bot|sign in to confirm you|different video/i.test(a.error ?? ""),
      ).length;
      const ipWide =
        bots >= 2 || (bots > 0 && bots === this.lastResolveAttempts.length);
      // Parallel resolves (a prefetch) hitting the same check count once.
      if (isBotAnswer(e) && ipWide && !this.isYouTubeResting()) {
        const ms = YT_REST_MS[Math.min(this.ytRests, YT_REST_MS.length - 1)];
        this.ytRests += 1;
        this.ytRestUntil = Date.now() + ms;
        this.rotateVisitor();
        this.onRequestError?.(
          "player",
          new Error(
            `YouTube resting ${ms / 60_000} min: ${(e as Error).message}`,
          ),
        );
      }
      throw e;
    }
  }
}
