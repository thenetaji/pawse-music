import type { Thumbnail, Track, VideoItem } from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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

const MAX = 60;
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
}>()(
  persist(
    () => ({
      list: [] as Watched[],
      liked: [] as SavedVideo[],
      disliked: [] as string[],
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
  useWatched.setState((s) => ({ list: s.list.filter((w) => w.id !== id) }));

/** Empties the watch history. */
export const clearWatched = () => useWatched.setState({ list: [] });

export function recordWatch(w: Omit<Watched, "at">) {
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
