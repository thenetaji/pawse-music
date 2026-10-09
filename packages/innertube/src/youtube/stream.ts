import {
  type AudioQuality,
  type ResolvedStream,
  StreamError,
} from "@pawse/music-core";

import { type FetchLike, fetchWithTimeout } from "../util/http";
import type { StreamClient } from "./clients";

export interface AdaptiveFormat {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
  approxDurationMs?: string;
  signatureCipher?: string;
  cipher?: string;
}

const PLAYER_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const DEFAULT_TTL_SEC = 300;
const PLAYER_TIMEOUT_MS = 8000;
const viaOf = (c: StreamClient) => `youtube:${c.name}`;

const isDirect = (f: AdaptiveFormat): boolean =>
  !!f.url && !f.signatureCipher && !f.cipher;
const isAac = (f: AdaptiveFormat): boolean =>
  /^audio\/mp4\b/i.test(f.mimeType ?? "") && /mp4a/i.test(f.mimeType ?? "");
const isOpus = (f: AdaptiveFormat): boolean =>
  /^audio\/webm\b/i.test(f.mimeType ?? "") && /opus/i.test(f.mimeType ?? "");

/** Direct-url AAC, highest bitrate first, 140 on ties; 'saver' prefers 139. AVPlayer cannot play WebM/Opus, so `opus` (ExoPlayer) only fills in when no AAC is offered. */
export function pickAudioFormat(
  formats: AdaptiveFormat[] | undefined,
  quality: AudioQuality = "high",
  opus = false,
): AdaptiveFormat | undefined {
  const direct = (formats ?? []).filter(isDirect);
  let usable = direct.filter(isAac);
  if (!usable.length && opus) usable = direct.filter(isOpus);
  if (quality === "saver") {
    const low = usable.find((f) => f.itag === 139 || f.itag === 249);
    if (low) return low;
    return usable.sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0))[0];
  }
  const rank = (f: AdaptiveFormat) =>
    f.itag === 140 || f.itag === 251 ? 1 : 0;
  return usable.sort(
    (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0) || rank(b) - rank(a),
  )[0];
}

/** Loudness relative to YouTube's target; older responses carry `loudnessDb` directly. */
export function loudnessOf(audioConfig: any): number | undefined {
  if (!audioConfig) return undefined;
  if (typeof audioConfig.loudnessDb === "number") return audioConfig.loudnessDb;
  const track =
    audioConfig.trackAbsoluteLoudnessLkfs ?? audioConfig.perceptualLoudnessDb;
  if (typeof track !== "number") return undefined;
  const target =
    typeof audioConfig.loudnessTargetLkfs === "number"
      ? audioConfig.loudnessTargetLkfs
      : -14;
  return Math.round((track - target) * 100) / 100;
}

/** Maps playabilityStatus to a StreamError, or undefined when playable. */
export function playabilityError(ps: any): StreamError | undefined {
  const status: string | undefined = ps?.status;
  if (status === "OK") return undefined;
  const reason = String(
    ps?.reason ?? ps?.messages?.[0] ?? status ?? "missing playability status",
  );
  if (status === "LOGIN_REQUIRED") {
    return /bot|sign in to confirm you/i.test(reason) && !/age/i.test(reason)
      ? new StreamError("blocked", reason)
      : new StreamError("age_restricted", reason);
  }
  if (
    status === "AGE_CHECK_REQUIRED" ||
    status === "AGE_VERIFICATION_REQUIRED" ||
    status === "CONTENT_CHECK_REQUIRED"
  ) {
    return new StreamError("age_restricted", reason);
  }
  if (status === "UNPLAYABLE" || status === "ERROR")
    return new StreamError("unplayable", reason);
  return new StreamError("blocked", reason);
}

export interface ResolveOptions {
  fetch: FetchLike;
  clients: StreamClient[];
  hl: string;
  gl: string;
  visitorData?: string;
  /** Confirms the URL with a bytes=0-1 request; skipped if it takes longer than verifyBudgetMs. */
  verify: boolean;
  verifyBudgetMs: number;
  quality?: AudioQuality;
  /** Accept WebM/Opus when no AAC is offered (ExoPlayer can play it, AVPlayer cannot). */
  opus?: boolean;
  /** `youtube:<client>` ids never to return (they failed for this track). */
  exclude?: string[];
  /** `youtube:<client>` ids to try last (they failed on this device). */
  avoid?: string[];
}

export interface ResolveAttempt {
  client: string;
  ms: number;
  error?: string;
}

function playerBody(c: StreamClient, videoId: string, o: ResolveOptions) {
  return {
    context: {
      client: {
        clientName: c.clientName,
        clientVersion: c.clientVersion,
        userAgent: c.userAgent,
        hl: o.hl,
        gl: o.gl,
        ...(o.visitorData ? { visitorData: o.visitorData } : {}),
        ...c.context,
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };
}

/** Signed-out player call: never sends cookies. */
async function tryClient(
  videoId: string,
  c: StreamClient,
  o: ResolveOptions,
): Promise<ResolvedStream> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": c.userAgent,
    "X-YouTube-Client-Name": String(c.clientNameId),
    "X-YouTube-Client-Version": c.clientVersion,
  };
  if (o.visitorData) headers["X-Goog-Visitor-Id"] = o.visitorData;
  let data: any;
  try {
    const res = await fetchWithTimeout(
      o.fetch,
      PLAYER_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify(playerBody(c, videoId, o)),
        credentials: "omit",
      },
      PLAYER_TIMEOUT_MS,
    );
    if (!res.ok)
      throw new StreamError(
        res.status === 403 || res.status === 429 ? "blocked" : "network",
        `player HTTP ${res.status}`,
      );
    data = await res.json();
  } catch (e) {
    if (e instanceof StreamError) throw e;
    throw new StreamError(
      "network",
      `player request failed: ${(e as Error)?.message ?? e}`,
    );
  }
  const bad = playabilityError(data?.playabilityStatus);
  if (bad) throw bad;
  const sd = data?.streamingData;
  const format = pickAudioFormat(sd?.adaptiveFormats, o.quality, o.opus);
  if (!format?.url)
    throw new StreamError(
      "no_audio",
      `no ${o.opus ? "AAC or Opus" : "AAC"} format with a direct url`,
    );
  const length = Number(format.contentLength);
  if (
    o.verify &&
    (await probe(
      o.fetch,
      format.url,
      c.userAgent,
      o.verifyBudgetMs,
      length > 0 ? length : undefined,
    )) === "forbidden"
  ) {
    throw new StreamError("blocked", "media url answered 403");
  }
  const ttl = Number(sd?.expiresInSeconds);
  const ms = Number(format.approxDurationMs);
  return {
    url: format.url,
    mimeType: format.mimeType ?? "audio/mp4",
    bitrate: format.bitrate ?? 0,
    contentLength: length > 0 ? length : undefined,
    expiresAt: Date.now() + (ttl > 0 ? ttl : DEFAULT_TTL_SEC) * 1000,
    headers: { "User-Agent": c.userAgent },
    loudnessDb: loudnessOf(data?.playerConfig?.audioConfig),
    durationSec: ms > 0 ? ms / 1000 : undefined,
    via: viaOf(c),
  };
}

/** Reads the last two bytes: some URLs serve the first megabyte, then answer 403. 'ok' on 2xx, 'forbidden' on 403, 'unknown' otherwise. */
export async function probe(
  f: FetchLike,
  url: string,
  userAgent: string,
  budgetMs: number,
  contentLength?: number,
): Promise<"ok" | "forbidden" | "unknown"> {
  const range =
    contentLength && contentLength > 2
      ? `bytes=${contentLength - 2}-${contentLength - 1}`
      : "bytes=0-1";
  try {
    const res = await fetchWithTimeout(
      f,
      url,
      {
        headers: { Range: range, "User-Agent": userAgent },
        credentials: "omit",
      },
      budgetMs,
    );
    if (res.status === 403) return "forbidden";
    return res.ok ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

const SEVERITY: Record<StreamError["code"], number> = {
  unplayable: 5,
  age_restricted: 4,
  blocked: 3,
  no_audio: 2,
  network: 1,
};

/** Client order for one resolve: `exclude` dropped, `avoid` moved to the end. */
export function orderClients(
  clients: StreamClient[],
  exclude: string[] = [],
  avoid: string[] = [],
): StreamClient[] {
  const left = clients.filter((c) => !exclude.includes(viaOf(c)));
  return [
    ...left.filter((c) => !avoid.includes(viaOf(c))),
    ...left.filter((c) => avoid.includes(viaOf(c))),
  ];
}

/** Tries each client in order; stops early on a definite 'unplayable'. */
export async function resolveYouTubeStream(
  videoId: string,
  o: ResolveOptions,
  attempts: ResolveAttempt[] = [],
): Promise<ResolvedStream> {
  const clients = orderClients(o.clients, o.exclude, o.avoid);
  if (o.clients.length && !clients.length)
    throw new StreamError(
      "blocked",
      "every stream client already failed for this track",
    );
  let worst: StreamError | undefined;
  for (const c of clients) {
    const t0 = Date.now();
    try {
      const stream = await tryClient(videoId, c, o);
      attempts.push({ client: c.name, ms: Date.now() - t0 });
      return stream;
    } catch (e) {
      const err =
        e instanceof StreamError
          ? e
          : new StreamError("network", String((e as Error)?.message ?? e));
      attempts.push({
        client: c.name,
        ms: Date.now() - t0,
        error: `${err.code}: ${err.message}`,
      });
      if (!worst || SEVERITY[err.code] > SEVERITY[worst.code]) worst = err;
      if (err.code === "unplayable") break;
    }
  }
  throw worst ?? new StreamError("unplayable", "no stream clients configured");
}
