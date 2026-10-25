import type { VideoItem } from "@pawse/music-core";

import { useLibrary } from "../data/library";
import { getSetting, setSetting, useSetting } from "./settings";

export type BlockedChannel = { id: string; name: string };

const words = () => getSetting<string[]>("blockedWords", []);
const channels = () => getSetting<BlockedChannel[]>("blockedChannels", []);

/** Whether a video stays visible: not from a blocked channel, and no blocked word in its title. */
export function useVideoFilter(): (v: VideoItem) => boolean {
  const ch = useSetting<BlockedChannel[]>("blockedChannels", []);
  const ws = useSetting<string[]>("blockedWords", []);
  const ids = new Set(ch.map((c) => c.id));
  const lower = ws.map((w) => w.toLowerCase());
  return (v) =>
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
