// Player lookup follows yt-dlp's _download_player_url / _extract_signature_timestamp (Unlicense).
import {
  defaultFetch,
  type FetchLike,
  fetchWithTimeout,
} from "../../util/http";

export interface PlayerJs {
  id: string;
  url: string;
  /** base.js source; pass it into the sandbox (youtube.com sends no ACAO header, so a WebView cannot fetch it). */
  js: string;
  /** signatureTimestamp for playbackContext.contentPlaybackContext. */
  sts: number;
}

export class ChallengeError extends Error {
  override name = "ChallengeError";
}

const IFRAME_API = "https://www.youtube.com/iframe_api";
export const playerJsUrl = (id: string) =>
  `https://www.youtube.com/s/player/${id}/player_ias.vflset/en_US/base.js`;
const ID_RE = /player\\?\/([0-9a-fA-F]{8})\\?\//;
const STS_RE = /(?:signatureTimestamp|sts)\s*:\s*([0-9]{5})/;
const ID_TTL_MS = 3600_000;
const IFRAME_TIMEOUT_MS = 5000;
const PLAYER_TIMEOUT_MS = 15_000;
const MAX_PLAYERS = 2;

let current: { id: string; until: number } | undefined;
const players = new Map<string, Promise<PlayerJs>>();

async function text(fetchFn: FetchLike, url: string, ms: number) {
  const res = await fetchWithTimeout(fetchFn, url, { credentials: "omit" }, ms);
  if (!res.ok) throw new ChallengeError(`${res.status} for ${url}`);
  return res.text();
}

/** Current player id from the iframe API, cached for an hour. */
export async function currentPlayerId(
  fetchFn: FetchLike = defaultFetch,
): Promise<string> {
  if (current && current.until > Date.now()) return current.id;
  const id = ID_RE.exec(
    await text(fetchFn, IFRAME_API, IFRAME_TIMEOUT_MS),
  )?.[1];
  if (!id) throw new ChallengeError("no player id in iframe_api");
  current = { id: id.toLowerCase(), until: Date.now() + ID_TTL_MS };
  return current.id;
}

/** Player id + base.js + sts, cached per id (newest two kept). */
export async function getPlayer(
  fetchFn: FetchLike = defaultFetch,
  playerId?: string,
): Promise<PlayerJs> {
  const id = playerId ?? (await currentPlayerId(fetchFn));
  let p = players.get(id);
  if (!p) {
    const url = playerJsUrl(id);
    p = text(fetchFn, url, PLAYER_TIMEOUT_MS).then((js) => {
      const sts = STS_RE.exec(js)?.[1];
      if (!sts) throw new ChallengeError(`no signatureTimestamp in ${id}`);
      return { id, url, js, sts: Number(sts) };
    });
    p.catch(() => players.delete(id));
    players.set(id, p);
    while (players.size > MAX_PLAYERS)
      players.delete(players.keys().next().value!);
  }
  return p;
}

/** yt-dlp's _generate_player_context: the `playbackContext` for a /player body. */
export const playbackContext = (sts?: number, encryptedHostFlags?: string) => ({
  contentPlaybackContext: {
    html5Preference: "HTML5_PREF_WANTS",
    ...(sts !== undefined ? { signatureTimestamp: sts } : {}),
    ...(encryptedHostFlags ? { encryptedHostFlags } : {}),
  },
});

const FLAGS_RE = /"encryptedHostFlags"\s*:\s*"([^"]+)"/;
const VISITOR_RE = /"visitorData"\s*:\s*"([^"]+)"/;

/** What web_embedded takes from the embed page (yt-dlp reads its ytcfg): the host flags and the visitor id they belong to. */
export interface EmbedSession {
  hostFlags?: string;
  visitorData?: string;
}

/** The embed page refuses a request without the embedder's Referer; an empty session when it is unavailable. */
export async function embedSession(
  fetchFn: FetchLike,
  videoId: string,
  userAgent: string,
  referer: string,
): Promise<EmbedSession> {
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      `https://www.youtube.com/embed/${videoId}?html5=1`,
      {
        headers: { "User-Agent": userAgent, Referer: referer },
        credentials: "omit",
      },
      IFRAME_TIMEOUT_MS,
    );
    if (!res.ok) return {};
    const page = await res.text();
    return {
      hostFlags: FLAGS_RE.exec(page)?.[1],
      visitorData: VISITOR_RE.exec(page)?.[1],
    };
  } catch {
    return {};
  }
}

/** Test hook: forget cached player ids and sources. */
export function resetPlayerCache() {
  current = undefined;
  players.clear();
}
