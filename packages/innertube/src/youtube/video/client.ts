import type {
  ChannelItem,
  ChannelPage,
  CommentPage,
  VideoDetail,
  VideoFeed,
  VideoItem,
  VideoSearchResults,
  VideoStream,
} from "@pawse/music-core";

import {
  defaultFetch,
  type FetchLike,
  fetchWithRetry,
  parseCookies,
} from "../../util/http";
import { sapisidAuthorization } from "../auth";
import { ClientsConfig, defaultStreamClients } from "../clients";
import { InnerTubeError, parseYtcfg } from "../music";
import type { JsSandbox, PoTokenProvider } from "../sandbox";
import type { ResolveAttempt } from "../stream";
import {
  parseChannel,
  parseComments,
  parseSuggestionsJson,
  parseVideoDetail,
  parseVideoFeed,
  parseVideoSearch,
} from "./parse";
import { resolveVideoStream } from "./stream";

export const WEB_ORIGIN = "https://www.youtube.com";
export const WEB_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
export const FALLBACK_WEB_CLIENT_VERSION = "2.20261020.01.00";
/** Videos tab of a channel (never Shorts). */
export const CHANNEL_VIDEOS_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";
/** Search filter: videos only, uploaded this week, sorted by views. */
export const POPULAR_THIS_WEEK_PARAMS = "CAMSBAgDEAE=";
export const DEFAULT_HOME_TOPICS = [
  "documentary",
  "science explained",
  "live music session",
  "tech review",
];
const HOME_PREFIX = "home:";

const TIMEOUT_MS = 12_000;
const BOOTSTRAP_RETRY_MS = 5 * 60_000;

export interface YouTubeVideoOptions {
  fetch?: FetchLike;
  hl?: string;
  gl?: string;
  /** The install's saved visitor id. */
  visitorData?: string;
  /** Cookie header for www.youtube.com when signed in; without it the feeds are signed out. */
  cookies?: () => string | undefined;
  /** True while searches should go out signed out, so they stay out of the account's search history. */
  privateSearch?: () => boolean;
  /** Topics the signed-out home searches (YouTube's own signed-out home is empty). */
  homeTopics?: string[];
  /** Remote stream-client list for resolveStream; null (default) keeps the built-in chain. */
  clientsConfigUrl?: string | null;
  /** Platform.OS, picks the built-in stream client list. */
  platform?: string;
  sandbox?: JsSandbox;
  poToken?: PoTokenProvider;
}

interface TopicSlot {
  q: string;
  /** Search continuation for this topic's next page. */
  t?: string;
}

interface WebConfig {
  clientVersion: string;
  visitorData?: string;
}

const hasSapisid = (c: string | undefined) => {
  if (!c) return false;
  const m = parseCookies(c);
  return !!(m.SAPISID || m["__Secure-3PAPISID"] || m["__Secure-1PAPISID"]);
};

/** The www.youtube.com catalog (WEB client) for YouTube mode: videos and channels, never Shorts. */
export class YouTubeVideo {
  hl: string;
  gl: string;
  /** Per-client attempts of the last resolveStream(), for diagnostics. */
  lastResolveAttempts: ResolveAttempt[] = [];

  private readonly f: FetchLike;
  private readonly cookies?: () => string | undefined;
  private readonly clients: ClientsConfig;
  private readonly opts: YouTubeVideoOptions;
  private web?: WebConfig;
  private webPending?: Promise<WebConfig>;
  private webFailedAt = 0;
  private visitorData?: string;
  private readonly channels = new Map<string, ChannelItem>();

  constructor(options: YouTubeVideoOptions = {}) {
    this.opts = options;
    this.f = options.fetch ?? defaultFetch;
    this.hl = options.hl ?? "en";
    this.gl = options.gl ?? "US";
    this.cookies = options.cookies;
    this.visitorData = options.visitorData;
    this.clients = new ClientsConfig(
      this.f,
      options.clientsConfigUrl ?? null,
      defaultStreamClients(options.platform),
    );
  }

  isSignedIn(): boolean {
    return hasSapisid(this.cookies?.());
  }

  /** Preloads ytcfg so the first call is fast. */
  async warmup(): Promise<void> {
    await this.config();
  }

  private acceptLanguage() {
    return this.hl === "en" ? "en-US,en;q=0.9" : `${this.hl},en;q=0.8`;
  }

  private async config(): Promise<WebConfig> {
    if (this.web) return this.web;
    if (this.webFailedAt && Date.now() - this.webFailedAt < BOOTSTRAP_RETRY_MS)
      return this.fallback();
    this.webPending ??= this.bootstrap().finally(() => {
      this.webPending = undefined;
    });
    return this.webPending;
  }

  private fallback(): WebConfig {
    return {
      clientVersion: FALLBACK_WEB_CLIENT_VERSION,
      visitorData: this.visitorData,
    };
  }

  private async bootstrap(): Promise<WebConfig> {
    try {
      const res = await fetchWithRetry(
        this.f,
        `${WEB_ORIGIN}/`,
        {
          headers: {
            "User-Agent": WEB_UA,
            "Accept-Language": this.acceptLanguage(),
            Cookie: "SOCS=CAI",
          },
          credentials: "omit",
        },
        TIMEOUT_MS,
      );
      const cfg = parseYtcfg(await res.text());
      if (!cfg.clientVersion) throw new Error("ytcfg missing");
      this.visitorData ??= cfg.visitorData;
      this.web = {
        clientVersion: cfg.clientVersion,
        visitorData: this.visitorData,
      };
      return this.web;
    } catch {
      this.webFailedAt = Date.now();
      return this.fallback();
    }
  }

  /** POST to a WEB endpoint, signed in when cookies hold a SAPISID. */
  async call(
    endpoint: string,
    body: Record<string, unknown>,
    signedOut = false,
  ): Promise<any> {
    const cfg = await this.config();
    const cookie = signedOut ? undefined : this.cookies?.();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": WEB_UA,
      "Accept-Language": this.acceptLanguage(),
      Origin: WEB_ORIGIN,
      Referer: `${WEB_ORIGIN}/`,
      "X-YouTube-Client-Name": "1",
      "X-YouTube-Client-Version": cfg.clientVersion,
    };
    if (cfg.visitorData) headers["X-Goog-Visitor-Id"] = cfg.visitorData;
    if (hasSapisid(cookie)) {
      headers.Cookie = cookie as string;
      headers["X-Goog-AuthUser"] = "0";
      headers["X-Origin"] = WEB_ORIGIN;
      const auth = sapisidAuthorization(cookie as string, WEB_ORIGIN);
      if (auth) headers.Authorization = auth;
    } else headers.Cookie = "SOCS=CAI";
    const res = await fetchWithRetry(
      this.f,
      `${WEB_ORIGIN}/youtubei/v1/${endpoint}?prettyPrint=false`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: cfg.clientVersion,
              hl: this.hl,
              gl: this.gl,
              ...(cfg.visitorData ? { visitorData: cfg.visitorData } : {}),
              userAgent: WEB_UA,
              platform: "DESKTOP",
              originalUrl: `${WEB_ORIGIN}/`,
            },
            user: { lockedSafetyMode: false },
          },
          ...body,
        }),
        credentials: "omit",
      },
      TIMEOUT_MS,
      // A signed-in call is never repeated.
      headers.Authorization ? 0 : 1,
    );
    if (!res.ok)
      throw new InnerTubeError(
        res.status,
        `InnerTube ${endpoint} HTTP ${res.status}`,
      );
    const json = await res.json();
    const vd = json?.responseContext?.visitorData;
    if (!this.visitorData && typeof vd === "string" && vd) {
      this.visitorData = vd;
      if (this.web) this.web = { ...this.web, visitorData: vd };
    }
    return json;
  }

  /** Recommended videos; with no feed to show (signed out) it is popular videos across `homeTopics`. */
  async home(continuation?: string): Promise<VideoFeed> {
    if (continuation?.startsWith(HOME_PREFIX))
      return this.topicsHome(
        JSON.parse(continuation.slice(HOME_PREFIX.length)) as TopicSlot[],
      );
    const topics = (this.opts.homeTopics ?? DEFAULT_HOME_TOPICS).map((q) => ({
      q,
    }));
    if (!continuation && !this.isSignedIn()) return this.topicsHome(topics);
    const feed = parseVideoFeed(
      await this.call(
        "browse",
        continuation ? { continuation } : { browseId: "FEwhat_to_watch" },
      ),
    );
    return continuation || feed.items.length ? feed : this.topicsHome(topics);
  }

  /** One popular-this-week search per topic, interleaved; YouTube serves signed-out visitors no home feed. */
  private async topicsHome(slots: TopicSlot[]): Promise<VideoFeed> {
    let failure: unknown;
    const pages = await Promise.all(
      slots.map(async (slot) => {
        try {
          return parseVideoSearch(
            await this.call(
              "search",
              slot.t
                ? { continuation: slot.t }
                : { query: slot.q, params: POPULAR_THIS_WEEK_PARAMS },
            ),
          );
        } catch (e) {
          failure ??= e;
          return undefined;
        }
      }),
    );
    if (failure && pages.every((p) => !p)) throw failure;
    const lists = pages.map((p) =>
      (p?.items ?? []).filter((i): i is VideoItem => i.type === "video"),
    );
    const items: VideoItem[] = [];
    const seen = new Set<string>();
    for (let i = 0; lists.some((l) => i < l.length); i++)
      for (const l of lists) {
        const v = l[i];
        if (v && !seen.has(v.id)) {
          seen.add(v.id);
          items.push(v);
        }
      }
    const next = slots.flatMap((slot, i) => {
      const t = pages[i]?.continuation;
      return t ? [{ q: slot.q, t }] : [];
    });
    return {
      items,
      ...(next.length
        ? { continuation: HOME_PREFIX + JSON.stringify(next) }
        : {}),
    };
  }

  /** Uploads from subscribed channels; needs a signed-in session. */
  async subscriptions(continuation?: string): Promise<VideoFeed> {
    if (!this.isSignedIn())
      throw new Error("Sign in to YouTube to see your subscriptions");
    return parseVideoFeed(
      await this.call(
        "browse",
        continuation ? { continuation } : { browseId: "FEsubscriptions" },
      ),
    );
  }

  /** Videos and channels only; playlists, Shorts, ads and mixes are dropped. */
  async search(q: string, continuation?: string): Promise<VideoSearchResults> {
    return parseVideoSearch(
      await this.call(
        "search",
        continuation ? { continuation } : { query: q },
        this.opts.privateSearch?.(),
      ),
    );
  }

  /** A channel's Videos tab (never Shorts). */
  async channel(id: string, continuation?: string): Promise<ChannelPage> {
    const json = await this.call(
      "browse",
      continuation
        ? { continuation }
        : { browseId: id, params: CHANNEL_VIDEOS_PARAMS },
    );
    const page = parseChannel(json, id, this.channels.get(id));
    if (page.channel.name) this.channels.set(id, page.channel);
    return page;
  }

  /** Title, channel, description, chapters and related videos of a watch page. */
  async video(id: string): Promise<VideoDetail> {
    return parseVideoDetail(
      await this.call("next", { videoId: id, racyCheckOk: true }),
      id,
    );
  }

  /** A page of comments (or replies) from a token on the watch page or a previous page. */
  async comments(token: string): Promise<CommentPage> {
    return parseComments(await this.call("next", { continuation: token }));
  }

  async suggestions(q: string): Promise<string[]> {
    if (!q.trim()) return [];
    const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&xhr=t&hl=${encodeURIComponent(this.hl)}&gl=${encodeURIComponent(this.gl)}&q=${encodeURIComponent(q)}`;
    const res = await fetchWithRetry(
      this.f,
      url,
      {
        headers: {
          "User-Agent": WEB_UA,
          "Accept-Language": this.acceptLanguage(),
        },
        credentials: "omit",
      },
      TIMEOUT_MS,
    );
    if (!res.ok)
      throw new InnerTubeError(res.status, `suggestions HTTP ${res.status}`);
    return parseSuggestionsJson(await res.text());
  }

  /** H.264 video plus AAC audio from one signed-out stream client. */
  async resolveStream(
    videoId: string,
    options: { maxHeight?: number; verify?: boolean } = {},
  ): Promise<VideoStream> {
    const cfg = await this.config();
    this.lastResolveAttempts = [];
    return resolveVideoStream(
      videoId,
      {
        fetch: this.f,
        clients: await this.clients.get(),
        hl: this.hl,
        gl: this.gl,
        visitorData: cfg.visitorData ?? this.visitorData,
        verify: options.verify ?? true,
        maxHeight: options.maxHeight,
        sandbox: this.opts.sandbox,
        poToken: this.opts.poToken,
      },
      this.lastResolveAttempts,
    );
  }
}
