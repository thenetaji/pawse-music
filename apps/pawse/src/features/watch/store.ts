import type { Thumbnail, VideoItem } from "@pawse/music-core";
import { create } from "zustand";

import type { WatchPlayer } from "../video/watch-player";

/** What's known about a video before its page loads, so the title and picture show at once. */
export type WatchSeed = {
  id: string;
  title?: string;
  thumbnails?: Thumbnail[];
  channel?: VideoItem["channel"];
};

interface WatchState {
  /** The video being watched; null when nothing is. */
  id: string | null;
  /** Where to start, seconds (a song's video opened where the song was). */
  t?: number;
  seed?: WatchSeed;
  /** Full screen, or shrunk into the mini player above the tabs. */
  mode: "full" | "mini";
  /** The session's player, so the mini player can show it and play or pause it. */
  player: WatchPlayer | null;
  playing: boolean;
  /** 0–1 through the video, for the mini player's bar. */
  progress: number;
  title?: string;
  channel?: string;
}

export const useWatch = create<WatchState>(() => ({
  id: null,
  mode: "full",
  player: null,
  playing: false,
  progress: 0,
}));

/** Opens a video full screen; the same video already in the mini player just grows back. */
export function openWatch(v: WatchSeed, t?: number) {
  const s = useWatch.getState();
  if (s.id === v.id && t === undefined) {
    useWatch.setState({ mode: "full" });
    return;
  }
  useWatch.setState({
    id: v.id,
    t,
    seed: v,
    mode: "full",
    player: null,
    playing: false,
    progress: 0,
    title: v.title,
    channel: v.channel?.name,
  });
}

export const minimizeWatch = () => useWatch.setState({ mode: "mini" });
export const expandWatch = () => useWatch.setState({ mode: "full" });
export const closeWatch = () =>
  useWatch.setState({
    id: null,
    player: null,
    playing: false,
    seed: undefined,
  });

/** The mini player slot shows the video instead of the song while a video sits there. */
export const useVideoMini = () =>
  useWatch((s) => !!s.id && s.mode === "mini" && !!s.player);
