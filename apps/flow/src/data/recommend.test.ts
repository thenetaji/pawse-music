import type { ArtistSummary, Track } from "@studio/music-core";

import type { Play } from "./library-model";
import {
  buildSmartPlaylists,
  type ForYouData,
  forYouShelves,
  pickSeeds,
  pickTracks,
  planSeeds,
  recentlyPlayed,
  scoreTracks,
  skipHeavy,
} from "./recommend";
import type { SignalMap, TrackSignal } from "./signals";

jest.mock("./clients", () => ({ yt: {}, dropExplicit: (v: unknown) => v }));
jest.mock("./library", () => ({ useLibrary: { getState: jest.fn() } }));
jest.mock("./signals", () => ({ useSignals: { getState: jest.fn() } }));
jest.mock("../lib/use-resource", () => ({ useResource: jest.fn() }));

const DAY = 86400_000;
const NOW = 1_800_000_000_000;

const track = (id: string, artist = `a-${id}`, title = id): Track => ({
  id,
  source: "youtube",
  title,
  artists: [{ name: artist }],
  thumbnails: [],
});
const plays = (t: Track, ...daysAgo: number[]): Play[] =>
  daysAgo.map((d) => ({ track: t, at: NOW - d * DAY }));
// History is newest first.
const history = (...p: Play[][]) => p.flat().sort((a, b) => b.at - a.at);
const sig = (s: Partial<TrackSignal>): TrackSignal => ({
  plays: 0,
  completes: 0,
  skips: 0,
  lastPlayed: 0,
  ...s,
});
const ids = (ts: { id: string }[]) => ts.map((t) => t.id);
const scoreOf = (
  id: string,
  h: Play[],
  opts: { liked?: Track[]; signals?: SignalMap } = {},
) =>
  scoreTracks({
    history: h,
    liked: opts.liked ?? [],
    signals: opts.signals ?? {},
    now: NOW,
  }).find((s) => s.track.id === id)?.score ?? 0;

describe("scoreTracks", () => {
  const a = track("a");
  const base = plays(a, 10, 11);

  it("raises likes, completes and recent plays; lowers skips", () => {
    const plain = scoreOf("a", base);
    expect(scoreOf("a", base, { liked: [a] })).toBeGreaterThan(plain);
    expect(
      scoreOf("a", base, { signals: { a: sig({ plays: 2, completes: 2 }) } }),
    ).toBeGreaterThan(plain);
    expect(scoreOf("a", plays(a, 1, 2))).toBeGreaterThan(plain);
    expect(scoreOf("a", plays(a, 40, 41))).toBeLessThan(plain);
    expect(
      scoreOf("a", base, { signals: { a: sig({ plays: 2, skips: 1 }) } }),
    ).toBeLessThan(plain);
  });

  it("drops tracks skipped more than played", () => {
    expect(
      scoreOf("a", plays(a, 1), {
        signals: { a: sig({ plays: 1, skips: 3 }) },
      }),
    ).toBe(0);
    expect([...skipHeavy({ a: sig({ plays: 1, skips: 3 }) })]).toEqual(["a"]);
    expect(skipHeavy({ a: sig({ plays: 3, skips: 2 }) }).size).toBe(0);
  });
});

describe("pickTracks", () => {
  it("caps two per artist and dedupes the same song across uploads", () => {
    const list = [
      track("1", "x"),
      track("1v", "x", "1 (Official Video)"),
      track("2", "x"),
      track("3", "x"),
      track("4", "y"),
    ];
    expect(ids(pickTracks(list, { n: 10 }))).toEqual(["1", "2", "4"]);
  });

  it("drops songs played in the last three days", () => {
    const h = history(plays(track("old"), 5), plays(track("new"), 1));
    const recent = recentlyPlayed(h, NOW);
    expect(recent.has("new") && !recent.has("old")).toBe(true);
    const list = [track("new"), track("old"), track("other")];
    expect(ids(pickTracks(list, { n: 10, skip: recent }))).toEqual([
      "old",
      "other",
    ]);
  });

  it("gives about a fifth of the slots to unfamiliar artists", () => {
    const list = [
      ...Array.from({ length: 20 }, (_, i) => track(`k${i}`)),
      ...Array.from({ length: 5 }, (_, i) => track(`u${i}`)),
    ];
    const known = new Set(Array.from({ length: 20 }, (_, i) => `a k${i}`));
    const out = pickTracks(list, { n: 10, known });
    expect(out).toHaveLength(10);
    expect(out.filter((t) => t.id.startsWith("u"))).toHaveLength(2);
  });
});

describe("buildSmartPlaylists", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => track(id));
  const lists = (h: Play[], liked: Track[] = []) =>
    Object.fromEntries(
      buildSmartPlaylists({ history: h, liked, signals: {}, now: NOW }).map(
        (p) => [p.id, ids(p.tracks)],
      ),
    );

  it("orders Top 50 by plays and keeps On repeat to the last 30 days", () => {
    const l = lists(
      history(plays(a, 1, 2), plays(b, 3, 4, 5), plays(c, 40, 41, 42, 43)),
    );
    expect(l.top50).toEqual(["c", "b", "a"]);
    expect(l.onrepeat).toEqual(["b", "a"]);
  });

  it("finds forgotten favourites and recent likes", () => {
    const l = lists(
      history(plays(a, 70, 71, 72), plays(b, 70, 71), plays(c, 10, 11, 12)),
      [d, a],
    );
    expect(l.forgotten).toEqual(["a"]);
    expect(l.recentliked).toEqual(["d", "a"]);
  });
});

describe("cold start", () => {
  const artist = (id: string): ArtistSummary => ({
    id,
    name: id,
    thumbnails: [],
  });

  it("falls back to picked artists, then charts", () => {
    expect(planSeeds([], [artist("p"), artist("q")])).toMatchObject({
      songs: [],
      artists: [{ id: "p" }, { id: "q" }],
      charts: false,
    });
    expect(planSeeds([], [])).toMatchObject({ artists: [], charts: true });
  });

  it("fills only the free slots, skipping artists a song seed covers", () => {
    const seeds = pickSeeds(
      scoreTracks({
        history: history(
          plays(track("s1", "p"), 1),
          plays(track("s2", "p"), 2),
        ),
        liked: [],
        signals: {},
        now: NOW,
      }),
    );
    expect(ids(seeds.map((s) => s.track))).toEqual(["s1"]);
    const plan = planSeeds(seeds, [artist("p"), artist("q")], 2);
    expect(ids(plan.artists)).toEqual(["q"]);
  });
});

describe("forYouShelves", () => {
  it("shows each song on one shelf only", () => {
    const own = ["r1", "r2", "r3", "r4"].map((id) => track(id));
    const pool = ["r1", "q1", "q2", "q3"].map((id) => track(id));
    const data: ForYouData = {
      sig: "",
      quick: pool,
      because: [],
      fresh: [],
      popular: [
        { title: "Popular in Hindi", tracks: [...pool, ...own].slice(0, 6) },
      ],
    };
    const shelves = forYouShelves(
      data,
      [{ id: "onrepeat", title: "", subtitle: "", tracks: own }],
      { drop: new Set(["q3"]) },
    );
    expect(shelves.map((s) => [s.title, ids(s.items)])).toEqual([
      ["Quick picks", ["q1", "q2"]],
      ["On repeat", ["r1", "r2", "r3", "r4"]],
    ]);
  });
});
