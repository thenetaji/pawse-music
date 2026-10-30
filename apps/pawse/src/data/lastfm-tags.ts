import type { Track } from "@pawse/music-core";

import { appFetch } from "../lib/net";
import { pacer } from "../lib/pacer";

const API = "https://ws.audioscrobbler.com/2.0/";
const GAP_MS = 300;
const TIMEOUT_MS = 10_000;
// Tag counts are relative to the song's top tag (100).
const MIN_COUNT = 20;
const TAGS_MAX = 8;

type Reply = {
  error?: number;
  toptags?: {
    tag?:
      | { name?: string; count?: number }[]
      | { name?: string; count?: number };
  };
};

export function parseTopTags(json: unknown): string[] {
  const raw = (json as Reply | null)?.toptags?.tag;
  const tags = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return tags
    .filter((t) => t.name && (t.count ?? 0) >= MIN_COUNT)
    .slice(0, TAGS_MAX)
    .map((t) => t.name!.toLowerCase());
}

const paced = pacer(GAP_MS);

// 6: song not found. Anything else (bad key, rate limit, outage) is worth stopping for.
const NOT_FOUND = 6;

export function lookupTags(apiKey: string, track: Track): Promise<string[]> {
  const artist = track.artists[0]?.name;
  if (!artist) return Promise.resolve([]);
  const params = new URLSearchParams({
    method: "track.getTopTags",
    artist,
    track: track.title,
    autocorrect: "1",
    api_key: apiKey,
    format: "json",
  });
  return paced(async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await appFetch(`${API}?${params}`, {
        credentials: "omit",
        signal: ctl.signal,
      });
      const body = (await res.json().catch(() => ({}))) as Reply;
      if (body.error === NOT_FOUND) return [];
      if (!res.ok || body.error)
        throw new Error(`Last.fm ${body.error ?? res.status}`);
      return parseTopTags(body);
    } finally {
      clearTimeout(timer);
    }
  });
}
