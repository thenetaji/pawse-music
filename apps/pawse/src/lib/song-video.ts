// A YouTube Music song is an audio upload whose "video" is the cover. Its picture comes from the
// official music video instead: YouTube Music's own pairing when it gives one, else a careful search.
import type { Track } from "@pawse/music-core";
import { useEffect, useSyncExternalStore } from "react";

import { yt } from "../data/clients";
import { MATCH_SCORE, scoreTrack } from "../data/import/score";
import { kv } from "../data/storage";

const KEY = "pawse.songvideo.v1";
const KEEP = 600;

// null: looked, and the song has no music video.
type Entry = string | null;
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

// A music video often runs longer than the song (an intro, a scene), never much shorter.
const fits = (song?: number, video?: number) =>
  !song || !video || (video >= song - 20 && video <= song + 240);

// "(Synthwave)", "(Live at Wembley)": another version, unless the song's own title says so too.
const TAGS = /[([]([^)\]]*)[)\]]/g;
const PLAIN =
  /official|video|audio|lyric|visuali[sz]er|\bhd\b|4k|\bmv\b|feat|\bft\b|\bfrom\b/i;
const versionTags = (title: string) =>
  (title.match(TAGS) ?? []).filter((t) => !PLAIN.test(t)).length;

/** The video to show for a track: itself when it already is one, its music video for a song, or null. */
export function findSongVideo(track: Track): Promise<Entry> {
  if (track.source !== "youtube") return Promise.resolve(null);
  if (track.kind !== "song") return Promise.resolve(track.id);
  if (track.musicVideoId) return Promise.resolve(track.musicVideoId);
  if (known.has(track.id)) return Promise.resolve(known.get(track.id) ?? null);
  let p = pending.get(track.id);
  if (!p) {
    const artist = track.artists[0]?.name ?? "";
    p = yt
      .search(`${track.title} ${artist}`.trim(), "videos")
      .then((res) => {
        const want = {
          title: track.title,
          artist: track.artists.map((a) => a.name).join(", "),
        };
        let best: { id: string; s: number } | undefined;
        for (const it of res.items ?? []) {
          if (it.type !== "track" || !it.official) continue;
          if (!fits(track.durationSec, it.durationSec)) continue;
          if (versionTags(it.title) > versionTags(track.title)) continue;
          const s = scoreTrack(want, it);
          if (!best || s > best.s) best = { id: it.id, s };
        }
        const entry = best && best.s >= MATCH_SCORE ? best.id : null;
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

/** The music video id for a track, null when it has none, undefined while looking. */
export function useSongVideo(track?: Track): Entry | undefined {
  const id = track?.id ?? "";
  const direct =
    !track || track.source !== "youtube"
      ? null
      : track.kind !== "song"
        ? track.id
        : track.musicVideoId;
  const found = useSyncExternalStore(
    subscribe,
    () => known.get(id),
    () => undefined,
  );
  const look = !!track && direct === undefined;
  useEffect(() => {
    if (track && look) void findSongVideo(track);
  }, [track, look]);
  return direct !== undefined ? direct : found;
}
