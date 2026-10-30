import type { VideoItem } from "@pawse/music-core";

import { useLibrary } from "../data/library";
import { useWatched } from "../data/watched";
import { playable } from "./playable";
import { getSetting, setSetting, useSetting } from "./settings";

export type BlockedChannel = { id: string; name: string };

const words = () => getSetting<string[]>("blockedWords", []);
const channels = () => getSetting<BlockedChannel[]>("blockedChannels", []);
// Videos marked "Not interested"; the oldest drop off.
const HIDDEN_MAX = 500;
const hidden = () => getSetting<string[]>("hiddenVideos", []);

/** "Not interested": the video leaves every feed, search and Up next. */
export function hideVideo(id: string): void {
  if (hidden().includes(id)) return;
  setSetting("hiddenVideos", [id, ...hidden()].slice(0, HIDDEN_MAX));
}

/** Whether a video stays visible: it can play, isn't from a blocked channel, and has no blocked word. */
export function useVideoFilter(): (v: VideoItem) => boolean {
  const ch = useSetting<BlockedChannel[]>("blockedChannels", []);
  const ws = useSetting<string[]>("blockedWords", []);
  const ids = new Set(ch.map((c) => c.id));
  const lower = ws.map((w) => w.toLowerCase());
  // Videos you disliked don't come back in feeds or Up next.
  const disliked = useWatched((s) => s.disliked);
  const notFor = useSetting<string[]>("hiddenVideos", []);
  return (v) =>
    playable(v) &&
    !disliked.includes(v.id) &&
    !notFor.includes(v.id) &&
    !(v.channel?.id && ids.has(v.channel.id)) &&
    !lower.some((w) => v.title.toLowerCase().includes(w));
}

export function blockChannel(c: BlockedChannel): void {
  if (channels().some((x) => x.id === c.id)) return;
  setSetting("blockedChannels", [c, ...channels()]);
}

export const unblockChannel = (id: string) =>
  setSetting(
    "blockedChannels",
    channels().filter((c) => c.id !== id),
  );

export function blockWord(w: string): void {
  const v = w.trim();
  if (!v || words().some((x) => x.toLowerCase() === v.toLowerCase())) return;
  setSetting("blockedWords", [v, ...words()]);
}

export const unblockWord = (w: string) =>
  setSetting(
    "blockedWords",
    words().filter((x) => x !== w),
  );

export const useBlockedCount = () =>
  useLibrary(
    (s) =>
      (
        (s.settings as Record<string, unknown>).blockedChannels as
          | unknown[]
          | undefined
      )?.length ?? 0,
  ) + useSetting<string[]>("blockedWords", []).length;
