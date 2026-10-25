import {
  type AudioQuality,
  type ResolvedStream,
  StreamError,
} from "@pawse/music-core";

import { type FetchLike, fetchWithTimeout } from "../util/http";
import {
  embedSession,
  getPlayer,
  type PlayerJs,
  playbackContext,
} from "./challenge/player";
import { solveChallenges } from "./challenge/solver";
import { applyN, applySig, challengesOf, nChallengeOf } from "./challenge/urls";
import type { StreamClient } from "./clients";
import type { JsSandbox, PoTokenProvider } from "./sandbox";

export interface AdaptiveFormat {
  itag: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  contentLength?: string;
  approxDurationMs?: string;
  signatureCipher?: string;
  cipher?: string;
  width?: number;
  height?: number;
  fps?: number;
  initRange?: { start: string; end: string };
  indexRange?: { start: string; end: string };
}

const PLAYER_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const DEFAULT_TTL_SEC = 300;
const PLAYER_TIMEOUT_MS = 8000;
const MINT_CAP_MS = 8000;
const viaOf = (c: StreamClient) => `youtube:${c.name}`;
const NONCE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const nonce = (n: number) =>
  Array.from(
    { length: n },
    () => NONCE_ALPHABET[Math.floor(Math.random() * 64)],
  ).join("");
const ipFamily = (url: string) => {
  const ip = /[?&]ip=([^&]*)/.exec(url)?.[1];
  return ip ? (decodeURIComponent(ip).includes(":") ? "v6" : "v4") : "none";
};

const hasUrl = (f: AdaptiveFormat): boolean =>
  !!(f.url || f.signatureCipher || f.cipher);
const isDirect = (f: AdaptiveFormat): boolean =>
  !!f.url && !f.signatureCipher && !f.cipher;
const isAac = (f: AdaptiveFormat): boolean =>
  /^audio\/mp4\b/i.test(f.mimeType ?? "") && /mp4a/i.test(f.mimeType ?? "");
const isOpus = (f: AdaptiveFormat): boolean =>
  /^audio\/webm\b/i.test(f.mimeType ?? "") && /opus/i.test(f.mimeType ?? "");

/** Direct-url AAC, highest bitrate first, 140 on ties; 'saver' prefers 139. AVPlayer cannot play WebM/Opus, so `opus` (ExoPlayer) only fills in when no AAC is offered. `ciphered` also accepts signatureCipher formats (a JsSandbox can solve them). */
export function pickAudioFormat(
  formats: AdaptiveFormat[] | undefined,
  quality: AudioQuality = "high",
  opus = false,
  ciphered = false,
): AdaptiveFormat | undefined {
  const direct = (formats ?? []).filter(ciphered ? hasUrl : isDirect);
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

const REST_REASON = "YouTube is resting after a bot check";
const DECOY_REASON = "YouTube answered for a different video";

/** The error resolve() throws at once while YouTube rests after a bot check. */
export const restingError = () => new StreamError("blocked", REST_REASON);

export const isYouTubeResting = (e: unknown): boolean =>
  e instanceof StreamError && e.message === REST_REASON;

/** A bot check, or a decoy answer for another video (YouTube rate-limiting). */
export function isBotAnswer(e: unknown): boolean {
  if (!(e instanceof StreamError) || e.code !== "blocked") return false;
  if (isYouTubeResting(e)) return false;
  return (
    e.message === DECOY_REASON || /bot|sign in to confirm you/i.test(e.message)
  );
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
  /** A client answered with a bot check (`youtube:<client>`). */
  onBot?: (via: string) => void;
  /** Solves sig/n challenges; without it clients that `need` js are skipped. */
  sandbox?: JsSandbox;
  /** BotGuard tokens for clients that `need` pot; without it those clients are skipped. */
  poToken?: PoTokenProvider;
  /** Picks the adaptive format to resolve instead of the AAC pick (video callers). */
  pick?: (
    formats: AdaptiveFormat[] | undefined,
    ciphered: boolean,
  ) => AdaptiveFormat | undefined;
  /** Gets the format that was resolved and the `youtube:<client>` that served it. */
  onFormat?: (format: AdaptiveFormat, via: string) => void;
}

export interface ResolveAttempt {
  client: string;
  ms: number;
  error?: string;
}

function playerBody(
  c: StreamClient,
  videoId: string,
  o: ResolveOptions,
  cpn?: string,
  sts?: number,
  hostFlags?: string,
  poToken?: string,
) {
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
      ...(c.thirdParty ? { thirdParty: c.thirdParty } : {}),
    },
    ...(sts !== undefined
      ? { playbackContext: playbackContext(sts, hostFlags) }
      : {}),
    videoId,
    ...(cpn ? { cpn } : {}),
    ...(poToken ? { serviceIntegrityDimensions: { poToken } } : {}),
    contentCheckOk: true,
    racyCheckOk: true,
  };
}

/** Clients this device can run: js ones need a sandbox, pot ones a token provider. */
const runnable = (
  clients: StreamClient[],
  sandbox?: JsSandbox,
  poToken?: PoTokenProvider,
) =>
  clients.filter(
    (c) =>
      (!c.needs?.includes("pot") || poToken) &&
      (!c.needs?.includes("js") || sandbox),
  );

/** A provider answer, undefined when it fails or takes longer than the cap (the provider keeps working on it). */
async function capped<T>(p: Promise<T | undefined>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch(() => undefined),
      new Promise<undefined>((r) => {
        timer = setTimeout(r, MINT_CAP_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const reason = (e: unknown) => (e as Error)?.message ?? String(e);

/** The format's media url with its signature and n challenge solved (yt-dlp's format loop). */
async function decipher(
  f: AdaptiveFormat,
  player: PlayerJs,
  sandbox: JsSandbox,
): Promise<string> {
  try {
    const solved = await solveChallenges(sandbox, player, challengesOf([f]));
    const signed = applySig(f, solved);
    const url = signed && applyN(signed, solved);
    if (!url) throw new Error("challenge left unsolved");
    return url;
  } catch (e) {
    throw new StreamError("network", `sig/n solver failed: ${reason(e)}`);
  }
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
    ...c.headers,
  };
  // PO tokens belong to the provider's visitor id, so a pot client uses that one.
  const pot = c.needs?.includes("pot") ? o.poToken : undefined;
  let playerPot: string | undefined;
  let requestVisitor = o.visitorData;
  if (pot) {
    requestVisitor = await capped(pot.visitorData());
    playerPot = requestVisitor && (await capped(pot.mint(requestVisitor)));
    if (!requestVisitor || !playerPot)
      throw new StreamError("network", "PO token unavailable");
  }
  if (requestVisitor) headers["X-Goog-Visitor-Id"] = requestVisitor;
  const cpn = c.cpn ? nonce(16) : undefined;
  const playerUrl = cpn
    ? `${c.url ?? PLAYER_URL}&t=${nonce(12)}&id=${videoId}`
    : (c.url ?? PLAYER_URL);
  let player: PlayerJs | undefined;
  if (c.needs?.includes("js")) {
    try {
      player = await getPlayer(o.fetch);
    } catch (e) {
      throw new StreamError("network", `player js unavailable: ${reason(e)}`);
    }
  }
  const embed = c.thirdParty
    ? await embedSession(o.fetch, videoId, c.userAgent, c.thirdParty.embedUrl)
    : undefined;
  if (c.thirdParty) headers.Referer = c.thirdParty.embedUrl;
  // The host flags only work with the visitor id of the page they came from.
  const visitorData = embed?.visitorData ?? requestVisitor;
  if (embed?.visitorData) headers["X-Goog-Visitor-Id"] = embed.visitorData;
  let data: any;
  try {
    const res = await fetchWithTimeout(
      o.fetch,
      playerUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify(
          playerBody(
            c,
            videoId,
            { ...o, visitorData },
            cpn,
            player?.sts,
            embed?.hostFlags,
            playerPot,
          ),
        ),
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
    throw new StreamError("network", `player request failed: ${reason(e)}`);
  }
  const answered = data?.videoDetails?.videoId;
  if (typeof answered === "string" && answered && answered !== videoId)
    throw new StreamError("blocked", DECOY_REASON);
  const bad = playabilityError(data?.playabilityStatus);
  if (bad) throw bad;
  const sd = data?.streamingData;
  const format = o.pick
    ? o.pick(sd?.adaptiveFormats, !!o.sandbox)
    : pickAudioFormat(sd?.adaptiveFormats, o.quality, o.opus, !!o.sandbox);
  if (!format)
    throw new StreamError(
      "no_audio",
      o.pick
        ? "no matching format with a usable url"
        : `no ${o.opus ? "AAC or Opus" : "AAC"} format with a ${o.sandbox ? "usable" : "direct"} url`,
    );
  let mediaUrl = format.url;
  const ciphered = !!(format.signatureCipher || format.cipher);
  if (o.sandbox && (ciphered || (player && nChallengeOf(mediaUrl ?? "")))) {
    try {
      player ??= await getPlayer(o.fetch);
    } catch (e) {
      throw new StreamError("network", `player js unavailable: ${reason(e)}`);
    }
    mediaUrl = await decipher(format, player, o.sandbox);
  }
  if (!mediaUrl) throw new StreamError("no_audio", "format has no url");
  const mediaHeaders: Record<string, string> = {
    "User-Agent": c.userAgent,
    ...(pot && c.headers?.Origin ? { Origin: c.headers.Origin } : {}),
    ...(pot && c.headers?.Referer ? { Referer: c.headers.Referer } : {}),
  };
  let url = cpn ? `${mediaUrl}&cpn=${cpn}` : mediaUrl;
  if (pot) {
    // The media server wants a token bound to the video id (the player call took the visitor-bound one).
    const gvs = await capped(pot.mint(videoId));
    if (!gvs) throw new StreamError("network", "PO token unavailable");
    url += `&pot=${encodeURIComponent(gvs)}`;
  }
  const length = Number(format.contentLength);
  if (
    o.verify &&
    (await probe(
      o.fetch,
      url,
      c.userAgent,
      o.verifyBudgetMs,
      length > 0 ? length : undefined,
      mediaHeaders,
    )) === "forbidden"
  ) {
    pot?.reportRejected?.();
    // An ip family other than the device's own points at a dual-stack mismatch.
    throw new StreamError(
      "blocked",
      `media url answered 403 (ip ${ipFamily(url)})`,
    );
  }
  const ttl = Number(sd?.expiresInSeconds);
  const ms = Number(format.approxDurationMs);
  o.onFormat?.(format, viaOf(c));
  return {
    url,
    mimeType: format.mimeType ?? "audio/mp4",
    bitrate: format.bitrate ?? 0,
    contentLength: length > 0 ? length : undefined,
    expiresAt: Date.now() + (ttl > 0 ? ttl : DEFAULT_TTL_SEC) * 1000,
    headers: mediaHeaders,
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
  extra: Record<string, string> = {},
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
        headers: { ...extra, Range: range, "User-Agent": userAgent },
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

/** Bot answers in one resolve that mean the IP, not one client, is flagged. */
const BOT_STOP = 2;
const UNPLAYABLE_STOP = 2;

const SEVERITY: Record<StreamError["code"], number> = {
  unplayable: 5,
  age_restricted: 4,
  blocked: 3,
  no_audio: 2,
  network: 1,
};

/** Client order for one resolve: `exclude` dropped, `avoid` moved to the end in its own order (latest failure last). */
export function orderClients(
  clients: StreamClient[],
  exclude: string[] = [],
  avoid: string[] = [],
): StreamClient[] {
  const left = clients.filter((c) => !exclude.includes(viaOf(c)));
  const rank = (c: StreamClient) => avoid.indexOf(viaOf(c));
  return [
    ...left.filter((c) => rank(c) < 0),
    ...left.filter((c) => rank(c) >= 0).sort((a, b) => rank(a) - rank(b)),
  ];
}

/** Tries each client in order; stops early on a definite 'unplayable', and on a second bot answer (asking again only deepens the flag). */
export async function resolveYouTubeStream(
  videoId: string,
  o: ResolveOptions,
  attempts: ResolveAttempt[],
): Promise<ResolvedStream> {
  const runs = runnable(o.clients, o.sandbox, o.poToken);
  const clients = orderClients(runs, o.exclude, o.avoid);
  if (runs.length && !clients.length)
    throw new StreamError(
      "blocked",
      "every stream client already failed for this track",
    );
  let worst: StreamError | undefined;
  let bot: StreamError | undefined;
  let bots = 0;
  let unplayable = 0;
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
      // One client's bot answer can be about that client alone (tv_samsung is refused while VISIONOS plays); two are about the IP.
      if (isBotAnswer(err)) {
        o.onBot?.(viaOf(c));
        bot = err;
        if (++bots >= BOT_STOP) throw err;
        continue;
      }
      if (!worst || SEVERITY[err.code] > SEVERITY[worst.code]) worst = err;
      // One client's "Video unavailable" can be its own limit (web_music, embeds); two mean the video.
      if (err.code === "unplayable" && ++unplayable >= UNPLAYABLE_STOP) break;
    }
  }
  if (bot) throw bot;
  // A saved visitor id can be in a YouTube experiment that refuses every URL; yt-dlp starts fresh, so try that once.
  if (worst?.code === "blocked" && o.visitorData)
    return resolveYouTubeStream(
      videoId,
      { ...o, visitorData: undefined, poToken: undefined },
      attempts,
    );
  throw worst ?? new StreamError("unplayable", "no stream clients configured");
}
