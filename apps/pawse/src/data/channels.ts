import type { Thumbnail, VideoFeed, VideoItem } from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { showToast } from "../components/toast";
import { ytv } from "../lib/engine";
import { playable } from "../lib/playable";
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
// `seen`: the newest upload you've looked at per channel, which puts its dot out.
type State = {
  list: FollowedChannel[];
  dropped: Record<string, number>;
  seen: Record<string, string>;
};
const SEEN_MAX = 300;
const useChannels = create<State>()(
  persist(() => ({ list: [], dropped: {}, seen: {} }) as State, {
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
export const followedChannels = () => useChannels.getState().list;

/** Puts out a channel's "new" dot until it posts again. */
export function markChannelSeen(channelId: string, videoId: string) {
  if (useChannels.getState().seen[channelId] === videoId) return;
  useChannels.setState((s) => ({
    seen: Object.fromEntries(
      Object.entries({ ...s.seen, [channelId]: videoId }).slice(-SEEN_MAX),
    ),
  }));
}
export const useSeenUpload = () => useChannels((s) => s.seen);
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

// Signed out, uploads come from each channel's own page.
const LOCAL_CHANNELS = 40;
const AT_ONCE = 6;
const PER_CHANNEL = 6;

/** `fn` over `xs`, at most `limit` at a time. */
async function pooled<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, xs.length) }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i]);
      }
    }),
  );
  return out;
}

/** New uploads from your channels: YouTube's feed when signed in, else gathered from the channels followed here. */
export async function subscriptionsFeed(
  continuation?: string,
): Promise<VideoFeed> {
  if (useLibrary.getState().settings.cookies) {
    const feed = await ytv.subscriptions(continuation);
    return { ...feed, items: feed.items.filter(playable) };
  }
  if (continuation) return { items: [] };
  const list = useChannels.getState().list.slice(0, LOCAL_CHANNELS);
  if (!list.length) return { items: [] };
  // A channel that fails is skipped.
  const pages = await pooled(list, AT_ONCE, (c) =>
    ytv.channel(c.id).catch(() => undefined),
  );
  if (pages.every((p) => !p)) throw new Error("Couldn't reach your channels");
  const seen = new Set<string>();
  const items: VideoItem[] = [];
  for (const p of pages)
    for (const v of (p?.videos ?? []).filter(playable).slice(0, PER_CHANNEL))
      if (!seen.has(v.id)) {
        seen.add(v.id);
        items.push(v);
      }
  // Newest first; ties keep the order you followed in.
  return {
    items: items
      .map((v, i) => ({ v, i, age: ageOf(v.publishedText) }))
      .sort((a, b) => a.age - b.age || a.i - b.i)
      .map((x) => x.v),
  };
}
