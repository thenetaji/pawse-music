import { type FetchLike, fetchWithTimeout } from "../util/http";

/** One InnerTube client profile for the signed-out player endpoint. */
export interface StreamClient {
  name: string;
  clientName: string;
  clientNameId: number;
  clientVersion: string;
  userAgent: string;
  /** Extra `context.client` fields (device, OS). */
  context: Record<string, string | number>;
  /** Player endpoint; default www.youtube.com. */
  url?: string;
  /** Extra player request headers. */
  headers?: Record<string, string>;
  /** Native-app shape: a cpn in the body and on the media URL, plus `t`/`id` on the player URL. */
  cpn?: boolean;
  /** js: formats are ciphered or carry an n challenge (needs a JsSandbox); pot: GVS PO token required. */
  needs?: ("js" | "pot")[];
  /** Extra `context.thirdParty` (web_embedded's embedUrl). */
  thirdParty?: { embedUrl: string };
}

export const VISIONOS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

const visionos = (clientVersion: string): StreamClient => ({
  name: `visionos-${clientVersion}`,
  clientName: "VISIONOS",
  clientNameId: 101,
  clientVersion,
  userAgent: VISIONOS_UA,
  context: {
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    osName: "visionOS",
    osVersion: "26.5.23O471",
  },
});

// NewPipe's VISIONOS profile: native app identity on the googleapis host.
const visionosApp: StreamClient = {
  name: "visionos_app-1.04",
  clientName: "VISIONOS",
  clientNameId: 101,
  clientVersion: "1.04",
  userAgent:
    "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)",
  context: {
    clientScreen: "WATCH",
    platform: "MOBILE",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    osName: "visionOS",
    osVersion: "26.6.0.23O770",
  },
  url: "https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false",
  headers: { "X-Goog-Api-Format-Version": "2" },
  cpn: true,
};

// Metrolist's VISIONOS: same identity, music.youtube.com player host.
const visionosMusic: StreamClient = {
  ...visionos("1.02"),
  name: "visionos_music-1.02",
  url: "https://music.youtube.com/youtubei/v1/player?prettyPrint=false",
  cpn: true,
};

/** Built-in order; mirrored in sources/innertube-clients.json at the repo root. */
export const DEFAULT_STREAM_CLIENTS: StreamClient[] = [
  visionos("1.02"),
  visionos("1.03"),
  visionos("1.01"),
  visionosApp,
  visionosMusic,
];

// Mirrors sources/innertube-clients-v2.json, generated from yt-dlp's INNERTUBE_CLIENTS by `pnpm sync:upstream`.
// The sandbox is Safari on macOS; sync-upstream.mjs gives web_music the same UA.
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

// YouTube Music's web client: needs a PO token (js + pot), served by the sandbox's PoTokenProvider.
const webMusic: StreamClient = {
  name: "web_music",
  clientName: "WEB_REMIX",
  clientNameId: 67,
  clientVersion: "1.20260707.12.00",
  userAgent: WEB_UA,
  context: {},
  url: "https://music.youtube.com/youtubei/v1/player?prettyPrint=false",
  headers: {
    Origin: "https://music.youtube.com",
    Referer: "https://music.youtube.com/",
  },
  needs: ["js", "pot"],
};

const tvSamsung: StreamClient = {
  name: "tv_samsung",
  clientName: "TVHTML5",
  clientNameId: 7,
  clientVersion: "5.20260707",
  userAgent:
    "Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4.0 TV Safari/538.1",
  context: {
    deviceMake: "Samsung",
    deviceModel: "UKS9800",
    osName: "Tizen",
    osVersion: "2.4.0",
  },
  needs: ["js"],
};

const webEmbedded: StreamClient = {
  name: "web_embedded",
  clientName: "WEB_EMBEDDED_PLAYER",
  clientNameId: 56,
  clientVersion: "2.20260708.00.00",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)",
  context: {},
  thirdParty: { embedUrl: "https://www.reddit.com/" },
  needs: ["js"],
};

/** Built-in order for builds that solve sig/n challenges; mirrored in sources/innertube-clients-v2.json. */
export const DEFAULT_STREAM_CLIENTS_V2: StreamClient[] = [
  webMusic,
  tvSamsung,
  { ...visionos("1.02"), name: "visionos", needs: [] },
  { ...visionosApp, needs: [] },
  { ...visionosMusic, needs: [] },
  webEmbedded,
];

/** Android order (ExoPlayer), mirrored under `android` in the remote config. ANDROID_VR is gone: every format 403s since 2026-08-17. */
export const DEFAULT_ANDROID_STREAM_CLIENTS: StreamClient[] = [
  ...DEFAULT_STREAM_CLIENTS,
];

/** Remote config key holding a platform's client list. */
export const clientsKeyFor = (platform?: string): string =>
  platform === "android" ? "android" : "clients";

export const defaultStreamClients = (
  platform?: string,
  v2 = false,
): StreamClient[] =>
  v2
    ? DEFAULT_STREAM_CLIENTS_V2
    : platform === "android"
      ? DEFAULT_ANDROID_STREAM_CLIENTS
      : DEFAULT_STREAM_CLIENTS;

export const DEFAULT_CLIENTS_CONFIG_URL =
  "https://raw.githubusercontent.com/thenetaji/pawse-music/main/sources/innertube-clients.json";

/** Client list for builds that solve sig/n challenges (JS clients); older builds keep reading the file above. */
export const DEFAULT_CLIENTS_V2_CONFIG_URL =
  "https://raw.githubusercontent.com/thenetaji/pawse-music/main/sources/innertube-clients-v2.json";

const CONFIG_TTL_MS = 6 * 3600_000;
const ERROR_TTL_MS = 10 * 60_000;
const CONFIG_TIMEOUT_MS = 2500;

/** Validates one list of a remote config (`clients` by default); undefined when it is unusable. */
export function parseClientsConfig(
  json: unknown,
  key = "clients",
): StreamClient[] | undefined {
  const list = (json as Record<string, unknown> | undefined)?.[key];
  if (!Array.isArray(list)) return undefined;
  const clients = list.filter(
    (c): c is StreamClient =>
      !!c &&
      typeof c.clientName === "string" &&
      typeof c.clientVersion === "string" &&
      typeof c.clientNameId === "number" &&
      typeof c.userAgent === "string",
  );
  if (!clients.length) return undefined;
  return clients.map((c) => ({
    name:
      typeof c.name === "string"
        ? c.name
        : `${c.clientName.toLowerCase()}-${c.clientVersion}`,
    clientName: c.clientName,
    clientNameId: c.clientNameId,
    clientVersion: c.clientVersion,
    userAgent: c.userAgent,
    context: c.context && typeof c.context === "object" ? c.context : {},
    ...(typeof c.url === "string" && /^https:\/\//.test(c.url)
      ? { url: c.url }
      : {}),
    ...(c.headers && typeof c.headers === "object"
      ? { headers: c.headers }
      : {}),
    ...(c.cpn === true ? { cpn: true } : {}),
    ...(Array.isArray(c.needs)
      ? { needs: c.needs.filter((n) => n === "js" || n === "pot") }
      : {}),
    ...(typeof c.thirdParty?.embedUrl === "string"
      ? { thirdParty: { embedUrl: c.thirdParty.embedUrl } }
      : {}),
  }));
}

/** Remote client list, cached 6 h; any failure falls back to the built-in list. */
export class ClientsConfig {
  private cached?: { clients: StreamClient[]; until: number };
  private pending?: Promise<StreamClient[]>;

  private readonly fetchFn: FetchLike;
  private readonly url: string | null;
  private readonly fallback: StreamClient[];
  private readonly key: string;

  constructor(
    fetchFn: FetchLike,
    url: string | null,
    fallback: StreamClient[] = DEFAULT_STREAM_CLIENTS,
    key = "clients",
  ) {
    this.fetchFn = fetchFn;
    this.url = url;
    this.fallback = fallback;
    this.key = key;
  }

  async get(): Promise<StreamClient[]> {
    if (!this.url) return this.fallback;
    if (this.cached && this.cached.until > Date.now())
      return this.cached.clients;
    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async load(): Promise<StreamClient[]> {
    try {
      const res = await fetchWithTimeout(
        this.fetchFn,
        this.url!,
        { credentials: "omit" },
        CONFIG_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`clients config ${res.status}`);
      const json = await res.json();
      // A config without this platform's list leaves the built-in order in charge.
      const clients =
        json && typeof json === "object" && !(this.key in json)
          ? this.fallback
          : parseClientsConfig(json, this.key);
      if (!clients) throw new Error("clients config has no usable clients");
      this.cached = { clients, until: Date.now() + CONFIG_TTL_MS };
    } catch {
      this.cached = {
        clients: this.fallback,
        until: Date.now() + ERROR_TTL_MS,
      };
    }
    return this.cached.clients;
  }
}
