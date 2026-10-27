import type { VideoFeed, VideoItem } from "@pawse/music-core";

import { ytv } from "../data/clients";
import { useWatched } from "../data/watched";

const PREFIX = "fy:";
// Videos you watched lately that each page grows from, and how many of each one's related videos join it.
const SEEDS_PER_PAGE = 3;
const PER_SEED = 8;
// Pages remember what they showed, so a later page doesn't repeat it.
const MAX_SHOWN = 400;

type State = { home?: string; seeds: string[]; shown: string[] };

/**
 * For you, built the way YouTube builds it: videos like the ones you watched lately, woven into the home feed,
 * in a new order each time, without the ones you've already seen. Signed in, YouTube's own feed is already
 * built from your history, so only what you've seen is taken out.
 */
export async function forYou(continuation?: string): Promise<VideoFeed> {
  const watched = new Set(useWatched.getState().list.map((w) => w.id));
  // Signed in, or a page saved before this: YouTube's own token.
  if (ytv.isSignedIn() || (continuation && !continuation.startsWith(PREFIX)))
    return unseen(await ytv.home(continuation), watched);

  const state: State = continuation
    ? (JSON.parse(continuation.slice(PREFIX.length)) as State)
    : { seeds: pickSeeds(), shown: [] };
  const first = !continuation;
  let failure: unknown;
  const [home, ...related] = await Promise.all([
    first || state.home
      ? ytv.home(state.home).catch((e: unknown) => {
          failure = e;
          return undefined;
        })
      : undefined,
    ...state.seeds.slice(0, SEEDS_PER_PAGE).map((id) =>
      ytv.video(id).then(
        (d) => d.related,
        () => [] as VideoItem[],
      ),
    ),
  ]);

  const skip = new Set([...watched, ...state.shown]);
  const fresh = (l: VideoItem[]) => shuffled(l.filter((v) => !skip.has(v.id)));
  const lists = [
    fresh(home?.items ?? []),
    ...related.map((l) => fresh(l).slice(0, PER_SEED)),
  ];
  const items: VideoItem[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) {
      const v = l[i];
      if (v && !skip.has(v.id)) {
        skip.add(v.id);
        items.push(v);
      }
    }
  if (first && !items.length && failure) throw failure;

  const next: State = {
    home: home?.continuation,
    seeds: state.seeds.slice(SEEDS_PER_PAGE),
    shown: [...state.shown, ...items.map((v) => v.id)].slice(-MAX_SHOWN),
  };
  const more = !!next.home || next.seeds.length > 0;
  return {
    items,
    ...(more ? { continuation: PREFIX + JSON.stringify(next) } : {}),
  };
}

/** Your recent videos first, in a new order each time, then older ones, so each open grows from different ones. */
function pickSeeds(): string[] {
  const { list, liked } = useWatched.getState();
  const ids = [
    ...new Set([...list.map((w) => w.id), ...liked.map((v) => v.id)]),
  ];
  return [...shuffled(ids.slice(0, 8)), ...shuffled(ids.slice(8, 40))];
}

const unseen = (feed: VideoFeed, watched: Set<string>): VideoFeed => ({
  ...feed,
  items: feed.items.filter((v) => !watched.has(v.id)),
});

function shuffled<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
