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

/** A playlist being watched in order: Up next and autoplay follow it. */
export type WatchList = { id: string; title: string; items: WatchSeed[] };

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
  /** Videos this session came from, newest last, for the previous button. */
  back: WatchSeed[];
  list?: WatchList;
  /** Landscape full screen; it stays on as the next video starts, like YouTube. */
  fullscreen: boolean;
  /** Pinched out in full screen: the picture fills the screen. */
  fill: boolean;
  /** Playback speed; kept from video to video. */
  speed: number;
  /** The open page swapped one video for another, so the new one appears in place instead of sliding up. */
  swapped: boolean;
}

export const useWatch = create<WatchState>(() => ({
  id: null,
  mode: "full",
  player: null,
  playing: false,
  progress: 0,
  back: [],
  fullscreen: false,
  fill: false,
  speed: 1,
  swapped: false,
}));

export const setWatchFullscreen = (on: boolean) =>
  useWatch.setState(
    on ? { fullscreen: true } : { fullscreen: false, fill: false },
  );
export const setWatchFill = (fill: boolean) => useWatch.setState({ fill });

/** Opens a video full screen; the same video already in the mini player just grows back. */
export function openWatch(
  v: WatchSeed,
  t?: number,
  o?: {
    back?: boolean;
    /** Autoplay: stay in the mini player if that's where the video was. */
    keepMode?: boolean;
    /** Watching a playlist; null leaves the one playing. Unset keeps it while the video is in it. */
    list?: WatchList | null;
  },
) {
  const s = useWatch.getState();
  const list =
    o?.list === null
      ? undefined
      : (o?.list ??
        (s.list?.items.some((x) => x.id === v.id) ? s.list : undefined));
  if (s.id === v.id) {
    // The same video keeps its player; a time just moves it there.
    if (t !== undefined) s.player?.seek(t);
    useWatch.setState({ mode: "full", list });
    return;
  }
  // Going on from a video remembers it; going back drops it.
  const back = o?.back
    ? s.back.slice(0, -1)
    : s.id && s.seed
      ? [...s.back, s.seed].slice(-30)
      : [];
  useWatch.setState({
    back,
    id: v.id,
    t,
    seed: v,
    mode: o?.keepMode ? s.mode : "full",
    player: null,
    playing: false,
    progress: 0,
    title: v.title,
    channel: v.channel?.name,
    list,
    swapped: !!s.id && s.mode === "full",
    fullscreen: s.id ? s.fullscreen : false,
  });
}

export const minimizeWatch = () =>
  useWatch.setState({ mode: "mini", fullscreen: false, fill: false });
export const expandWatch = () => useWatch.setState({ mode: "full" });
export const closeWatch = () =>
  useWatch.setState({
    back: [],
    id: null,
    player: null,
    playing: false,
    seed: undefined,
    list: undefined,
    fullscreen: false,
    fill: false,
  });

/** The mini player slot shows the video instead of the song while a video sits there. */
// Not tied to the player: autoplay swaps players, and the slot would flick to the song between them.
export const useVideoMini = () =>
  useWatch((s) => !!s.id && s.mode === "mini");

/** Back to the video before this one in the session. */
export function watchPrevious(): boolean {
  const prev = useWatch.getState().back.at(-1);
  if (!prev) return false;
  openWatch(prev, undefined, { back: true });
  return true;
}
