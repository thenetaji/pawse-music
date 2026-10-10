// Music videos carry YouTube video stills (often with "725M views" style text). Like YouTube Music,
// show the matching song's square album cover instead, when a confident match exists.
import type { Thumbnail, Track } from "@pawse/music-core";
import { useEffect, useSyncExternalStore } from "react";

import { yt } from "../data/clients";
import { MATCH_SCORE, scoreTrack } from "../data/import/score";
import { kv } from "../data/storage";

const KEY = "pawse.songart.v1";
const KEEP = 400;
const YTIMG = /^https?:\/\/i\d?\.ytimg\.com\//;

type Entry = Thumbnail[] | null;
let known = new Map<string, Entry>();
try {
  const raw = kv.getItem(KEY);
  if (typeof raw === "string") known = new Map(JSON.parse(raw));
} catch {}
const pending = new Map<string, Promise<Entry>>();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function remember(id: string, entry: Entry) {
  known.delete(id);
  known.set(id, entry);
  for (const old of known.keys()) {
    if (known.size <= KEEP) break;
    known.delete(old);
  }
  for (const l of listeners) l();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => void kv.set(KEY, JSON.stringify([...known])),
    2000,
  );
}

/** True when the track's art is a YouTube video still rather than an album cover. */
export const hasVideoArt = (t?: Track) =>
  !!t?.thumbnails.length && t.thumbnails.every((th) => YTIMG.test(th.url));

/** The matching song's cover for a music video, or null; looked up once per track and remembered. */
export function findSongArt(track: Track): Promise<Entry> {
  if (!hasVideoArt(track)) return Promise.resolve(null);
  if (known.has(track.id)) return Promise.resolve(known.get(track.id) ?? null);
  let p = pending.get(track.id);
  if (!p) {
    const artist = track.artists[0]?.name ?? "";
    p = yt
      .search(`${track.title} ${artist}`.trim(), "songs")
      .then((res) => {
        const item = {
          title: track.title,
          artist,
          durationSec: track.durationSec,
        };
        let best: { t: Track; s: number } | undefined;
        for (const it of res.items ?? []) {
          if (it.type !== "track" || !it.thumbnails.length) continue;
          const s = scoreTrack(item, it);
          if (!best || s > best.s) best = { t: it, s };
        }
        const entry = best && best.s >= MATCH_SCORE ? best.t.thumbnails : null;
        remember(track.id, entry);
        return entry;
      })
      // A failed search isn't remembered, so the next play tries again.
      .catch(() => null)
      .finally(() => pending.delete(track.id));
    pending.set(track.id, p);
  }
  return p;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The thumbnails to show for a track: its song cover when found, its own art otherwise. */
export function useSongArt(track?: Track): Thumbnail[] {
  const id = track?.id ?? "";
  const found = useSyncExternalStore(
    subscribe,
    () => known.get(id),
    () => undefined,
  );
  const video = hasVideoArt(track);
  useEffect(() => {
    if (track && video) void findSongArt(track);
  }, [track, video]);
  return found ?? track?.thumbnails ?? [];
}
