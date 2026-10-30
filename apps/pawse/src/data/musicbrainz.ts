import type { Track } from "@pawse/music-core";

import { appVersion } from "../lib/app-version";
import { appFetch } from "../lib/net";
import { pacer } from "../lib/pacer";

// MusicBrainz allows one request per second and asks for a descriptive User-Agent.
const API = "https://musicbrainz.org/ws/2/recording";
const USER_AGENT = `Pawse/${appVersion} (https://github.com/thenetaji/pawse-music)`;
const GAP_MS = 1100;
const TIMEOUT_MS = 10_000;
const MIN_SCORE = 90;
const DURATION_SLACK_SEC = 15;
const TAGS_MAX = 8;

export type Recording = { year?: number; tags: string[] };
export type Wanted = { title: string; artist: string; durationSec?: number };

type Hit = {
  score?: number;
  title?: string;
  length?: number;
  "first-release-date"?: string;
  "artist-credit"?: { name?: string; artist?: { name?: string } }[];
  tags?: { name?: string; count?: number }[];
};

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/\s-\s.*(remaster|version|edit|mix|live|mono|stereo|\d{4}).*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function queryFor({ title, artist }: Wanted): string {
  const phrase = (s: string) => `"${s.replace(/["\\]/g, " ").trim()}"`;
  return `recording:${phrase(title)} AND artist:${phrase(artist)}`;
}

export function parseRecording(
  json: unknown,
  want: Wanted,
  now = Date.now(),
): Recording | undefined {
  const hits = (json as { recordings?: Hit[] } | null)?.recordings;
  if (!Array.isArray(hits)) return undefined;
  const title = plain(want.title);
  const artist = plain(want.artist);
  const same = hits.filter(
    (h) =>
      (h.score ?? 0) >= MIN_SCORE &&
      plain(h.title ?? "") === title &&
      h["artist-credit"]?.some(
        (c) => plain(c.name ?? c.artist?.name ?? "") === artist,
      ),
  );
  const near = want.durationSec
    ? same.filter(
        (h) =>
          !h.length ||
          Math.abs(h.length / 1000 - want.durationSec!) <= DURATION_SLACK_SEC,
      )
    : same;
  // A radio edit may not match the length; the song is still the song.
  const found = near.length ? near : same;
  if (!found.length) return undefined;

  const last = new Date(now).getFullYear() + 1;
  const years = found
    .map((h) => Number(h["first-release-date"]?.slice(0, 4)))
    .filter((y) => y >= 1900 && y <= last);
  const votes = new Map<string, number>();
  for (const h of found)
    for (const t of h.tags ?? [])
      if (t.name)
        votes.set(
          t.name.toLowerCase(),
          (votes.get(t.name.toLowerCase()) ?? 0) + Math.max(1, t.count ?? 1),
        );
  return {
    year: years.length ? Math.min(...years) : undefined,
    tags: [...votes]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TAGS_MAX)
      .map(([name]) => name),
  };
}

const paced = pacer(GAP_MS);

export function lookupRecording(track: Track): Promise<Recording | undefined> {
  const want: Wanted = {
    title: track.title,
    artist: track.artists[0]?.name ?? "",
    durationSec: track.durationSec,
  };
  const url = `${API}?query=${encodeURIComponent(queryFor(want))}&fmt=json&limit=10`;
  return paced(async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await appFetch(url, {
        credentials: "omit",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
      return parseRecording(await res.json(), want);
    } finally {
      clearTimeout(timer);
    }
  });
}
