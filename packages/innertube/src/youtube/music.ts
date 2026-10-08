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
  type Shelf,
  StreamError,
  type StreamResolver,
  type Track,
  type UpNext,
} from "@studio/music-core";

import {
  defaultFetch,
  type FetchLike,
  fetchWithRetry,
  fetchWithTimeout,
  parseCookies,
  query,
} from "../util/http";
import { sapisidAuthorization } from "./auth";
import {
  ClientsConfig,
  DEFAULT_CLIENTS_CONFIG_URL,
  DEFAULT_STREAM_CLIENTS,
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
  parseSearch,
  parseSuggestions,
} from "./parse";
import { type ResolveAttempt, resolveYouTubeStream } from "./stream";

export interface YouTubeMusicOptions {
  fetch?: FetchLike;
  hl?: string;
  gl?: string;
  /** Cookie header for music.youtube.com when signed in; only catalog/account calls use it. */
  cookies?: () => Promise<string | null> | string | null;
  visitorData?: string;
  /** Remote stream-client list; null disables it. */
  clientsConfigUrl?: string | null;
  /** Built-in stream clients (default VISIONOS 1.02, 1.03, 1.01). */
  streamClients?: StreamClient[];
  /** Range-check the media URL before returning it (default true). */
  verifyStream?: boolean;
  /** Skip the range check when it takes longer than this (default 400 ms). */
  verifyBudgetMs?: number;
  /** Called once per catalog/account request that fails after retries. */
  onRequestError?: (endpoint: string, error: unknown) => void;
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
const IDEMPOTENT = new Set([
  "browse",
  "search",
  "next",
  "music/get_search_suggestions",
  "account/account_menu",
]);
const BOOTSTRAP_RETRY_MS = 5 * 60_000;

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

/** YouTube Music over InnerTube: WEB_REMIX for catalog/account, signed-out VISIONOS chain for streams. */
export class YouTubeMusic implements Catalog, Account, StreamResolver {
  hl: string;
  gl: string;
  /** Per-client attempts of the last resolve(), for diagnostics. */
  lastResolveAttempts: ResolveAttempt[] = [];

  private readonly f: FetchLike;
  private readonly cookies?: YouTubeMusicOptions["cookies"];
  private readonly clients: ClientsConfig;
  private readonly verify: boolean;
  private readonly verifyBudgetMs: number;
  private readonly onRequestError?: YouTubeMusicOptions["onRequestError"];
  private web?: WebConfig;
  private webPending?: Promise<WebConfig>;
  private webFailedAt = 0;
  private signedIn = false;
  private visitorData?: string;

  constructor(options: YouTubeMusicOptions = {}) {
    this.f = options.fetch ?? defaultFetch;
    this.hl = options.hl ?? "en";
    this.gl = options.gl ?? "US";
    this.cookies = options.cookies;
    this.visitorData = options.visitorData;
    this.verify = options.verifyStream ?? true;
    this.verifyBudgetMs = options.verifyBudgetMs ?? 400;
    this.onRequestError = options.onRequestError;
    const url =
      options.clientsConfigUrl === undefined
        ? DEFAULT_CLIENTS_CONFIG_URL
        : options.clientsConfigUrl;
    this.clients = new ClientsConfig(
      this.f,
      url,
      options.streamClients ?? DEFAULT_STREAM_CLIENTS,
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
    return this.signedIn ? c : null;
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
        visitorData: this.visitorData ?? cfg.visitorData,
        apiKey: cfg.apiKey,
      };
      this.visitorData = this.web.visitorData;
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

  /** POST to a WEB_REMIX endpoint, signed in when cookies are available. */
  async call(endpoint: string, body: Record<string, unknown>): Promise<any> {
    const [cfg, cookie] = await Promise.all([
      this.config(),
      this.cookie().catch(() => null),
    ]);
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
        },
        TIMEOUT_MS,
        IDEMPOTENT.has(endpoint) ? 1 : 0,
      );
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
    const vd = json?.responseContext?.visitorData;
    if (!this.visitorData && typeof vd === "string") this.visitorData = vd;
    return json;
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

  async search(
    q: string,
    filter: SearchFilter = "all",
  ): Promise<SearchResults> {
    const params = filter === "all" ? undefined : SEARCH_PARAMS[filter];
    return parseSearch(
      await this.call("search", { query: q, ...(params ? { params } : {}) }),
      filter,
    );
  }

  /** Next page of a filtered search. */
  async searchMore(continuation: string): Promise<SearchResults> {
    return parseSearch(await this.call("search", { continuation }), "songs");
  }

  async suggestions(q: string): Promise<string[]> {
    return parseSuggestions(
      await this.call("music/get_search_suggestions", { input: q }),
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
      const player = await this.call("player", {
        videoId,
        racyCheckOk: true,
        contentCheckOk: true,
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
      const get = (url: string, extra: Record<string, string | number>) =>
        fetchWithTimeout(
          this.f,
          `${url}${url.includes("?") ? "&" : "?"}${query({ ...base, ...extra })}`,
          { headers, credentials: "omit" },
          TIMEOUT_MS,
        );
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
    const clients = await this.clients.get();
    this.lastResolveAttempts = [];
    return resolveYouTubeStream(
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
      },
      this.lastResolveAttempts,
    );
  }
}
