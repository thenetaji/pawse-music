import type { Thumbnail, Track, VideoItem } from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { useLibrary } from "./library";
import { kv } from "./storage";

/** A video you started, and how far you got. */
export type Watched = {
  id: string;
  title: string;
  thumbnails: Thumbnail[];
  channel?: VideoItem["channel"];
  /** Seconds watched and the video's length. */
  pos: number;
  dur: number;
  at: number;
};

// Enough to mark the videos you've seen wherever they show up again.
const MAX = 300;
// Closer than this to the end counts as finished, so it isn't offered to continue.
const DONE_SEC = 20;

/** A video you liked, kept on the phone so likes work signed out too. */
export type SavedVideo = Pick<
  Watched,
  "id" | "title" | "thumbnails" | "channel" | "at"
> & {
  durationSec?: number;
};

export type VideoRating = "like" | "dislike" | "none";

export const useWatched = create<{
  list: Watched[];
  liked: SavedVideo[];
  disliked: string[];
  /** Removed here on purpose: YouTube's history doesn't bring these back. */
  forgotten: string[];
  /** History cleared here: YouTube's older entries stay out. */
  clearedAt: number;
}>()(
  persist(
    () => ({
      list: [] as Watched[],
      liked: [] as SavedVideo[],
      disliked: [] as string[],
      forgotten: [] as string[],
      clearedAt: 0,
    }),
    {
      name: "pawse.watched.v1",
      storage: createJSONStorage(() => kv),
      version: 1,
    },
  ),
);

/** Records progress on a video, newest first. */
/** Forgets a video from Watched and Continue. */
export const removeWatched = (id: string) =>
  useWatched.setState((s) => ({
    list: s.list.filter((w) => w.id !== id),
    forgotten: [id, ...s.forgotten.filter((x) => x !== id)].slice(0, MAX),
  }));

/** Empties the watch history. */
export const clearWatched = () =>
  useWatched.setState({ list: [], clearedAt: Date.now() });

// YouTube keeps whole percents, so a spot this close to ours is the same spot.
const SAME_SPOT_SEC = 30;

/** Folds in your YouTube history: videos watched elsewhere appear, and a spot moved on YouTube wins. */
export function mergeYouTubeHistory(items: { video: VideoItem; at: number }[]) {
  useWatched.setState((s) => {
    const byId = new Map(s.list.map((w) => [w.id, w]));
    let changed = false;
    for (const { video: v, at } of items) {
      if (at < s.clearedAt || s.forgotten.includes(v.id)) continue;
      const dur = v.durationSec ?? 0;
      const pos = v.watched !== undefined && dur ? v.watched * dur : 0;
      const mine = byId.get(v.id);
      if (mine) {
        if (at <= mine.at || !pos || Math.abs(pos - mine.pos) < SAME_SPOT_SEC)
          continue;
        byId.set(v.id, { ...mine, pos, dur: mine.dur || dur, at });
      } else {
        byId.set(v.id, {
          id: v.id,
          title: v.title,
          thumbnails: v.thumbnails,
          channel: v.channel,
          pos,
          dur,
          at,
        });
      }
      changed = true;
    }
    if (!changed) return s;
    return {
      list: [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX),
    };
  });
}

export function recordWatch(w: Omit<Watched, "at">) {
  if (useLibrary.getState().settings.incognito) return;
  useWatched.setState((s) => ({
    list: [
      { ...w, at: Date.now() },
      ...s.list.filter((x) => x.id !== w.id),
    ].slice(0, MAX),
  }));
}

export const isUnfinished = (w: Watched) =>
  w.pos > 5 && (!w.dur || w.dur - w.pos > DONE_SEC);

/** Where to pick a video back up, if you left it partway. */
export const resumeAt = (id: string): number | undefined => {
  const w = useWatched.getState().list.find((x) => x.id === id);
  return w && isUnfinished(w) ? w.pos : undefined;
};

/** Your like or dislike of a video, as kept on this phone. */
export const useVideoRating = (id: string): VideoRating =>
  useWatched((s) =>
    s.liked.some((v) => v.id === id)
      ? "like"
      : s.disliked.includes(id)
        ? "dislike"
        : "none",
  );

export function rateVideo(v: VideoItem, r: VideoRating) {
  useWatched.setState((s) => ({
    liked:
      r === "like"
        ? [
            {
              id: v.id,
              title: v.title,
              thumbnails: v.thumbnails,
              channel: v.channel,
              durationSec: v.durationSec,
              at: Date.now(),
            },
            ...s.liked.filter((x) => x.id !== v.id),
          ]
        : s.liked.filter((x) => x.id !== v.id),
    disliked:
      r === "dislike"
        ? [v.id, ...s.disliked.filter((x) => x !== v.id)].slice(0, 500)
        : s.disliked.filter((x) => x !== v.id),
  }));
}

/** A video as a song for the music player, playlists and downloads. */
export const videoTrack = (
  v: Pick<VideoItem, "id" | "title" | "thumbnails" | "channel" | "durationSec">,
  durationSec?: number,
): Track => ({
  id: v.id,
  source: "youtube",
  title: v.title,
  artists: [{ id: v.channel?.id, name: v.channel?.name ?? "YouTube" }],
  durationSec: durationSec ?? v.durationSec,
  thumbnails: v.thumbnails,
  kind: "video",
});
