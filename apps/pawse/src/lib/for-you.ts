import type { VideoFeed, VideoItem } from "@pawse/music-core";

import { followedChannels } from "../data/channels";
import { ytv } from "../data/clients";
import { kv } from "../data/storage";
import { useWatched } from "../data/watched";
import { noteShown, orderFeed, type Seen } from "./for-you-order";
import { learnsFromWatching } from "./learn";
import { playable } from "./playable";

const PREFIX = "fy:";
// Each page grows from a few videos you watched, taking some of each one's related videos.
const SEEDS_PER_PAGE = 3;
const PER_SEED = 8;
// Each page also takes the newest uploads of a couple of followed channels.
const CHANNELS_PER_PAGE = 2;
const PER_CHANNEL_UPLOADS = 4;
const PAGE_CAP = 2;
const FEED_CAP = 5;
// Related videos join the seeds, so later pages reach beyond what you watched.
const HOPS_PER_SEED = 1;
const MAX_SEEDS = 30;
const MAX_SHOWN = 400;
// How many of YouTube's leading videos swap places among themselves.
const LEAD = 10;
// Videos earlier opens showed go last, and what led the last few refreshes goes last of all.
export const RECENT_KEY = "pawse.forYou.recent";
const TOPS_KEY = "pawse.forYou.tops";
// Signed out, a new visitor has no home feed, so each open searches a few of these.
const TOPICS = [
  "documentary",
  "science explained",
  "live music session",
  "tech review",
  "cooking",
  "travel vlog",
  "gaming",
  "comedy sketch",
  "podcast",
  "news",
  "sports highlights",
  "DIY build",
  "history",
  "fitness",
  "animation",
  "interview",
  "space",
  "nature",
  "cars",
  "art",
];
const TOPICS_PER_OPEN = 2;

type State = {
  home?: string;
  seeds: string[];
  chans: string[];
  shown: string[];
  per: Record<string, number>;
};

let seen: Seen | undefined;
export const forgetOffered = () => {
  seen = { recent: [], tops: [] };
  void kv.removeItem(TOPS_KEY);
};
const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = kv.getItem(key);
    return typeof raw === "string" ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const seenNow = (): Seen =>
  (seen ??= {
    recent: read<string[]>(RECENT_KEY, []),
    tops: read<string[][]>(TOPS_KEY, []),
  });

/**
 * For you: videos like the ones you watched, your channels' newest uploads and popular ones, in a new order each
 * time and without what you've seen. Signed in, YouTube's own feed is used, minus watched and unplayable videos.
 */
export async function forYou(continuation?: string): Promise<VideoFeed> {
  const watched = new Set(useWatched.getState().list.map((w) => w.id));
  // A token that isn't ours is YouTube's own, from a page saved earlier.
  if (ytv.isSignedIn() || (continuation && !continuation.startsWith(PREFIX))) {
    const feed = await ytv.home(continuation);
    const items = feed.items.filter((v) => !watched.has(v.id) && playable(v));
    if (continuation) return { ...feed, items };
    // YouTube's lead is the same for a while, so its leading videos trade places and last time's go down.
    const lead = [...shuffled(items.slice(0, LEAD)), ...items.slice(LEAD)];
    const ordered = orderFeed(lead, seenNow());
    remember(
      ordered.map((v) => v.id),
      true,
    );
    return { ...feed, items: ordered };
  }

  const first = !continuation;
  const state: State = continuation
    ? (JSON.parse(continuation.slice(PREFIX.length)) as State)
    : {
        seeds: pickSeeds(),
        chans: shuffled(followedChannels().map((c) => c.id)),
        shown: [],
        per: {},
      };
  let failure: unknown;
  const soft = <T>(p: Promise<T>) =>
    p.catch((e: unknown) => {
      failure = e;
      return undefined;
    });
  // With learning on, YouTube's feed for this visitor leads; a new visitor gets popular videos.
  const learn = learnsFromWatching();
  const seeds = state.seeds.slice(0, SEEDS_PER_PAGE);
  const chans = state.chans.slice(0, CHANNELS_PER_PAGE);
  const [topics, related, uploads] = await Promise.all([
    Promise.all(
      first
        ? [
            ...(learn ? [soft(ytv.home())] : []),
            ...pickTopics(learn ? 1 : TOPICS_PER_OPEN).map((q) =>
              soft(ytv.topic(q)),
            ),
          ]
        : [state.home ? soft(ytv.home(state.home)) : undefined],
    ),
    Promise.all(
      seeds.map((id) =>
        ytv.video(id).then(
          (d) => d.related,
          () => [] as VideoItem[],
        ),
      ),
    ),
    Promise.all(
      chans.map((id) =>
        ytv.channel(id).then(
          (p) => p.videos.slice(0, PER_CHANNEL_UPLOADS),
          () => [] as VideoItem[],
        ),
      ),
    ),
  ]);

  const skip = new Set([...watched, ...state.shown]);
  const fresh = (l: VideoItem[]) =>
    shuffled(l.filter((v) => !skip.has(v.id) && playable(v)));
  const lists = [
    ...uploads.map((l) => fresh(l)),
    ...related.map((l) => fresh(l).slice(0, PER_SEED)),
    ...topics.map((t) => fresh(t?.items ?? [])),
  ];
  const turns = shuffled(lists);
  const per = { ...state.per };
  const onPage: Record<string, number> = {};
  const picked: VideoItem[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of turns) {
      const v = l[i];
      if (!v || skip.has(v.id)) continue;
      const ch = v.channel?.id;
      if (ch && ((onPage[ch] ?? 0) >= PAGE_CAP || (per[ch] ?? 0) >= FEED_CAP))
        continue;
      skip.add(v.id);
      if (ch) {
        onPage[ch] = (onPage[ch] ?? 0) + 1;
        per[ch] = (per[ch] ?? 0) + 1;
      }
      picked.push(v);
    }
  const items = orderFeed(picked, seenNow());
  if (first && !items.length && failure) throw failure;
  remember(
    items.map((v) => v.id),
    first,
  );

  // An unwatched related video becomes a seed behind the watched ones.
  const hops = related.flatMap((l) =>
    shuffled(l.filter((v) => !watched.has(v.id) && playable(v)))
      .slice(0, HOPS_PER_SEED)
      .map((v) => v.id),
  );
  const next: State = {
    home: topics.find((t) => t?.continuation)?.continuation,
    seeds: [...state.seeds.slice(SEEDS_PER_PAGE), ...hops].slice(0, MAX_SEEDS),
    chans: state.chans.slice(CHANNELS_PER_PAGE),
    shown: [...state.shown, ...items.map((v) => v.id)].slice(-MAX_SHOWN),
    per,
  };
  const more = !!next.home || next.seeds.length > 0 || next.chans.length > 0;
  return {
    items,
    ...(more ? { continuation: PREFIX + JSON.stringify(next) } : {}),
  };
}

/** Recent videos, then liked and older ones, each group shuffled. */
function pickSeeds(): string[] {
  const { list, liked } = useWatched.getState();
  const ids = [
    ...new Set([...list.map((w) => w.id), ...liked.map((v) => v.id)]),
  ];
  return [...shuffled(ids.slice(0, 8)), ...shuffled(ids.slice(8, 40))];
}

/** Some topics, and a channel you watched, to search for what's popular this week. */
function pickTopics(count: number): string[] {
  const names = [
    ...new Set(
      useWatched
        .getState()
        .list.slice(0, 12)
        .flatMap((w) => (w.channel?.name ? [w.channel.name] : [])),
    ),
  ];
  const mine = shuffled(names).slice(0, 1);
  return [...shuffled(TOPICS).slice(0, count), ...mine];
}

function remember(ids: string[], first: boolean) {
  seen = noteShown(seenNow(), ids, first);
  void kv.set(RECENT_KEY, JSON.stringify(seen.recent)).catch(() => {});
  void kv.set(TOPS_KEY, JSON.stringify(seen.tops)).catch(() => {});
}

function shuffled<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
