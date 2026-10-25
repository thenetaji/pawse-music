import type { Thumbnail, VideoFeed, VideoItem } from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { showToast } from "../components/toast";
import { ytv } from "../lib/engine";
import { refreshResources } from "../lib/use-resource";
import { ytAccount } from "./clients";
import { useLibrary } from "./library";
import { kv } from "./storage";

export type FollowedChannel = {
  id: string;
  name: string;
  avatar?: Thumbnail[];
};

// Channels subscribed to on this phone (signed in or not), and ones just dropped, until YouTube's own lists catch up.
type State = { list: FollowedChannel[]; dropped: Record<string, number> };
const useChannels = create<State>()(
  persist(() => ({ list: [], dropped: {} }) as State, {
    name: "pawse.channels.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);

// YouTube's subscriptions feed can lag an unsubscribe by a while; a dropped channel stays hidden this long.
const DROP_MS = 7 * 24 * 3600 * 1000;
const isDropped = (s: State, id: string) =>
  Date.now() - (s.dropped[id] ?? 0) < DROP_MS;

export const useFollowedChannels = () => useChannels((s) => s.list);
export const useDroppedChannel = () => {
  const dropped = useChannels((s) => s.dropped);
  return (id: string) => Date.now() - (dropped[id] ?? 0) < DROP_MS;
};

/** Subscribed here, or on YouTube (`server`) and not dropped since. */
export function useSubscribed(id: string | undefined, server?: boolean) {
  return useChannels((s) =>
    !id
      ? false
      : s.list.some((c) => c.id === id) || (!!server && !isDropped(s, id)),
  );
}

/** Subscribes on this phone, and on YouTube too when signed in; a refusal puts it back. */
export function setSubscribed(ch: FollowedChannel, on: boolean) {
  const apply = (yes: boolean) =>
    useChannels.setState((s) => {
      const list = s.list.filter((c) => c.id !== ch.id);
      const dropped = { ...s.dropped };
      if (yes) delete dropped[ch.id];
      else dropped[ch.id] = Date.now();
      return { list: yes ? [ch, ...list] : list, dropped };
    });
  apply(on);
  showToast(on ? `Subscribed to ${ch.name}` : `Unsubscribed from ${ch.name}`);
  if (!useLibrary.getState().settings.cookies) {
    void refreshResources(["watch:subs"]);
    return;
  }
  ytAccount
    .subscribe(ch.id, on)
    .then(() => refreshResources(["watch:subs"]))
    .catch(() => {
      apply(!on);
      showToast("YouTube didn't take that. Try again.");
    });
}

// "3 hours ago" → seconds, roughly, so uploads from many channels can be put in order.
const UNIT: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
  year: 31536000,
};
export function ageOf(text?: string): number {
  const m = text?.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/i);
  return m ? Number(m[1]) * UNIT[m[2].toLowerCase()] : Number.MAX_SAFE_INTEGER;
}

// Signed out, the feed is built from each channel's own page; this many at most, so it stays quick.
const LOCAL_CHANNELS = 15;

/** New uploads from your channels: YouTube's feed when signed in, else gathered from the channels followed here. */
export async function subscriptionsFeed(
  continuation?: string,
): Promise<VideoFeed> {
  if (useLibrary.getState().settings.cookies)
    return ytv.subscriptions(continuation);
  if (continuation) return { items: [] };
  const list = useChannels.getState().list.slice(0, LOCAL_CHANNELS);
  if (!list.length) return { items: [] };
  const pages = await Promise.all(
    list.map((c) => ytv.channel(c.id).catch(() => undefined)),
  );
  const items: VideoItem[] = pages.flatMap((p) => p?.videos.slice(0, 6) ?? []);
  if (!items.length && pages.every((p) => !p))
    throw new Error("Couldn't reach your channels");
  return {
    items: items.sort(
      (a, b) => ageOf(a.publishedText) - ageOf(b.publishedText),
    ),
  };
}
