import type { Thumbnail, VideoItem } from "@pawse/music-core";
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

export const useWatched = create<{ list: Watched[] }>()(
  persist(() => ({ list: [] as Watched[] }), {
    name: "pawse.watched.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);

/** Records progress on a video, newest first. */
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
