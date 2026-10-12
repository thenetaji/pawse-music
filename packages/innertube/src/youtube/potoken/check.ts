// "YouTube check": does the YouTube Music web client (WEB_REMIX) play with our PO tokens, and in what form?
import { type FetchLike, fetchWithTimeout } from "../../util/http";
import type { PoTokenProvider } from "../sandbox";

/** WEB_REMIX version from yt-dlp's web_music client. */
export const WEB_MUSIC_CLIENT_VERSION = "1.20260707.12.00";
const PLAYER_URL = "https://music.youtube.com/youtubei/v1/player?prettyPrint=false";
const TIMEOUT_MS = 12_000;
// A 64 KiB range past 1.5 MiB: past the part GVS serves without a valid pot.
const PROBE_FROM = 1536 * 1024;
const PROBE_LEN = 64 * 1024;

export interface WebMusicFormat {
  itag: number;
  mimeType?: string;
  url?: string;
  signatureCipher?: string;
}

export interface WebMusicCheckOptions {
  clientVersion?: string;
  /** Player JS signature timestamp; defaults to the provider's ytcfg STS when it has one. */
  signatureTimestamp?: number;
  /** Turns a format into a playable URL (signature + n); without it only direct URLs are probed. */
  decipher?: (f: WebMusicFormat) => Promise<string | undefined>;
  /** Skip the range fetch. */
  noProbe?: boolean;
  userAgent?: string;
}

export interface WebMusicCheck {
  videoId: string;
  ms: number;
  visitorData: boolean;
  /** Player-request token, bound to visitorData. */
  playerPot: boolean;
  signatureTimestamp?: number;
  httpStatus?: number;
  playability?: string;
  reason?: string;
  /** ATTESTATION_* states in the response, plus "playerAttestationRenderer" when it asks for one. */
  attestation: string[];
  audio: { total: number; direct: number; ciphered: number; neither: number };
  sabrUrl: boolean;
  verdict: "direct" | "ciphered" | "sabr-only" | "none";
  /** Range fetch status per GVS `pot` binding ("none" = no pot). */
  probe?: { itag: number; status: Record<"videoId" | "visitorData" | "none", number | string> };
  error?: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/** Mints tokens, asks WEB_REMIX /player, reports how audio comes back and whether GVS takes our `pot`. */
export async function checkWebMusic(
  f: FetchLike,
  provider: PoTokenProvider,
  videoId: string,
  o: WebMusicCheckOptions = {},
): Promise<WebMusicCheck> {
  const t0 = Date.now();
  const out: WebMusicCheck = {
    videoId,
    ms: 0,
    visitorData: false,
    playerPot: false,
    attestation: [],
    audio: { total: 0, direct: 0, ciphered: 0, neither: 0 },
    sabrUrl: false,
    verdict: "none",
  };
  const ua = o.userAgent ?? UA;
  const cv = o.clientVersion ?? WEB_MUSIC_CLIENT_VERSION;
  try {
    const visitorData = await provider.visitorData();
    out.visitorData = !!visitorData;
    const playerPot = visitorData ? await provider.mint(visitorData) : undefined;
    out.playerPot = !!playerPot;
    const cfg =
      "ytcfg" in provider && typeof provider.ytcfg === "function"
        ? ((await provider.ytcfg()) as Record<string, unknown> | undefined)
        : undefined;
    const sts = o.signatureTimestamp ?? (Number(cfg?.STS) || undefined);
    out.signatureTimestamp = sts;

    const res = await fetchWithTimeout(
      f,
      PLAYER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": ua,
          Origin: "https://music.youtube.com",
          Referer: "https://music.youtube.com/",
          "X-Youtube-Client-Name": "67",
          "X-Youtube-Client-Version": cv,
          ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB_REMIX",
              clientVersion: cv,
              hl: "en",
              gl: "US",
              userAgent: ua,
              ...(visitorData ? { visitorData } : {}),
            },
          },
          videoId,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: "HTML5_PREF_WANTS",
              ...(sts ? { signatureTimestamp: sts } : {}),
            },
          },
          ...(playerPot ? { serviceIntegrityDimensions: { poToken: playerPot } } : {}),
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      },
      TIMEOUT_MS,
    );
    out.httpStatus = res.status;
    const text = await res.text();
    out.attestation = [...new Set(text.match(/ATTESTATION_[A-Z_]+/g) ?? [])];
    if (text.includes("playerAttestationRenderer")) out.attestation.push("playerAttestationRenderer");
    const j = JSON.parse(text) as {
      playabilityStatus?: { status?: string; reason?: string };
      streamingData?: { adaptiveFormats?: WebMusicFormat[]; serverAbrStreamingUrl?: string };
    };
    out.playability = j.playabilityStatus?.status;
    out.reason = j.playabilityStatus?.reason;
    const sd = j.streamingData;
    out.sabrUrl = !!sd?.serverAbrStreamingUrl;
    const audio = (sd?.adaptiveFormats ?? []).filter((x) => x.mimeType?.startsWith("audio/"));
    for (const a of audio) {
      out.audio.total++;
      if (a.url) out.audio.direct++;
      else if (a.signatureCipher || (a as { cipher?: string }).cipher) out.audio.ciphered++;
      else out.audio.neither++;
    }
    out.verdict = out.audio.direct
      ? "direct"
      : out.audio.ciphered
        ? "ciphered"
        : out.sabrUrl
          ? "sabr-only"
          : "none";

    const pick =
      audio.find((a) => a.itag === 251 && (a.url || a.signatureCipher)) ??
      audio.find((a) => a.url || a.signatureCipher);
    if (!o.noProbe && pick) {
      const url = pick.url && !o.decipher ? pick.url : await o.decipher?.(pick);
      if (url) {
        const pots = {
          videoId: await provider.mint(videoId),
          visitorData: playerPot,
          none: undefined,
        };
        const status = {} as Record<"videoId" | "visitorData" | "none", number | string>;
        for (const [k, pot] of Object.entries(pots) as [keyof typeof pots, string | undefined][]) {
          if (k !== "none" && !pot) {
            status[k] = "no token";
            continue;
          }
          status[k] = await probe(f, url, pot, ua);
        }
        out.probe = { itag: pick.itag, status };
      }
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.ms = Date.now() - t0;
  return out;
}

async function probe(f: FetchLike, url: string, pot: string | undefined, ua: string) {
  const u = `${url}${pot ? `&pot=${encodeURIComponent(pot)}` : ""}&range=${PROBE_FROM}-${PROBE_FROM + PROBE_LEN - 1}`;
  try {
    const res = await fetchWithTimeout(
      f,
      u,
      { headers: { "User-Agent": ua, Origin: "https://music.youtube.com", Referer: "https://music.youtube.com/" } },
      TIMEOUT_MS,
    );
    const len = (await res.arrayBuffer()).byteLength;
    return res.ok && len !== PROBE_LEN ? `${res.status} (${len} B)` : res.status;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
