import type { Track } from "@studio/music-core";

import { yt } from "../clients";
import type { ImportItem } from "./formats";
import {
  MATCH_SCORE,
  normArtist,
  normTitle,
  scoreTrack,
  UNSURE_SCORE,
} from "./score";

export type MatchResult = {
  item: ImportItem;
  status: "matched" | "unsure" | "missing";
  track?: Track;
  candidates: Track[];
};

const CONCURRENCY = 3;
const GAP_MS = 150;
const KEEP = 3;
const KEEP_MISSING_ABOVE = 0.3;

const abortError = () => {
  const e = new Error("Import matching stopped");
  e.name = "AbortError";
  return e;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    function stop() {
      clearTimeout(t);
      reject(abortError());
    }
    signal?.addEventListener("abort", stop, { once: true });
  });

// The track YouTube Music knows for a videoId; falls back to the file's own title/artist.
async function byVideoId(item: ImportItem, videoId: string): Promise<Track> {
  try {
    const next = await yt.upNext({ videoId });
    const hit = next.tracks.find((t) => t.id === videoId);
    if (hit) return { ...hit, setVideoId: undefined };
  } catch {
    // Trust the id below.
  }
  return {
    id: videoId,
    source: "youtube",
    title: item.title || videoId,
    artists: item.artist ? [{ name: item.artist }] : [],
    ...(item.durationSec ? { durationSec: item.durationSec } : {}),
    thumbnails: [],
  };
}

async function searchSongs(item: ImportItem): Promise<Track[]> {
  const q = [item.title, item.artist].filter(Boolean).join(" ");
  const res = await yt.search(q, "songs");
  return (res.items ?? []).flatMap((it) => {
    if (it.type !== "track") return [];
    const { type: _type, ...track } = it;
    return [track];
  });
}

function judge(item: ImportItem, found: Track[]): MatchResult {
  const ranked = found
    .map((track) => ({ track, score: scoreTrack(item, track) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  if (best >= MATCH_SCORE)
    return {
      item,
      status: "matched",
      track: ranked[0].track,
      candidates: ranked.slice(0, KEEP).map((r) => r.track),
    };
  const keep =
    best >= UNSURE_SCORE
      ? ranked
      : ranked.filter((r) => r.score > KEEP_MISSING_ABOVE);
  return {
    item,
    status: best >= UNSURE_SCORE ? "unsure" : "missing",
    candidates: keep.slice(0, KEEP).map((r) => r.track),
  };
}

/** Finds each imported song on YouTube Music; results keep input order and one failed lookup only marks that song missing. */
export function matchTracks(
  items: ImportItem[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<MatchResult[]> {
  if (signal?.aborted) return Promise.reject(abortError());
  const results: MatchResult[] = new Array(items.length);
  const cache = new Map<string, Promise<Track[]>>();
  let nextStart = 0;
  let cursor = 0;
  let done = 0;

  // Spaces request starts GAP_MS apart across all workers.
  const slot = () => {
    const now = Date.now();
    const at = Math.max(now, nextStart);
    nextStart = at + GAP_MS;
    return sleep(at - now, signal);
  };

  const lookup = (item: ImportItem): Promise<Track[]> => {
    const key = item.videoId
      ? `v:${item.videoId}`
      : `${normTitle(item.title)}|${normArtist(item.artist ?? "")}`;
    let hit = cache.get(key);
    if (!hit) {
      const videoId = item.videoId;
      hit = slot().then(() =>
        videoId ? byVideoId(item, videoId).then((t) => [t]) : searchSongs(item),
      );
      cache.set(key, hit);
    }
    return hit;
  };

  const one = async (item: ImportItem): Promise<MatchResult> => {
    let found: Track[];
    try {
      found = await lookup(item);
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if ((e as Error)?.name === "AbortError") throw e;
      return { item, status: "missing", candidates: [] };
    }
    if (signal?.aborted) throw abortError();
    if (item.videoId)
      return { item, status: "matched", track: found[0], candidates: found };
    return judge(item, found);
  };

  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await one(items[i]);
      onProgress?.(++done, items.length);
    }
  };

  const work = Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker),
  ).then(() => results);
  if (!signal) return work;
  // Rejects at once on abort, even while a request is still in flight.
  return new Promise<MatchResult[]>((resolve, reject) => {
    const stop = () => reject(abortError());
    signal.addEventListener("abort", stop, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", stop));
  });
}
