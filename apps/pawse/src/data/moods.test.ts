import type { Track } from "@pawse/music-core";
import type { Play } from "./library-model";
import {
  decadeOf,
  eraOf,
  type Filters,
  type Item,
  inMood,
  isAllowed,
  pickMix,
  sessionNeighbours,
  tagEnergy,
  type Vector,
  vectorOf,
} from "./moods";

jest.mock("./clients", () => ({ yt: {}, dropExplicit: (v: unknown) => v }));
jest.mock("./library", () => ({ useLibrary: { getState: jest.fn() } }));
jest.mock("./signals", () => ({ useSignals: { getState: jest.fn() } }));
jest.mock("../lib/use-resource", () => ({ useResource: jest.fn() }));

const NOW = 1_800_000_000_000;
const MIN = 60_000;

const track = (
  id: string,
  extra: Partial<Track> = {},
  artist = `a-${id}`,
): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [{ name: artist }],
  thumbnails: [],
  ...extra,
});
const vec = (t: Track, ev: Parameters<typeof vectorOf>[1], near?: Vector[]) =>
  vectorOf(t, ev, NOW, near);
const item = (id: string, ev: Parameters<typeof vectorOf>[1]): Item => {
  const t = track(id);
  return { track: t, vector: vec(t, ev) };
};
const ids = (ts: Track[]) => ts.map((t) => t.id);

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("labels", () => {
  it("reads decades from titles and tags", () => {
    expect(decadeOf("90s")).toBe(1990);
    expect(decadeOf("Megahits: '90s")).toBe(1990);
    expect(decadeOf("1980s hits")).toBe(1980);
    expect(decadeOf("00s")).toBe(2000);
    expect(decadeOf("2000s")).toBe(2000);
    expect(decadeOf("r&b")).toBeUndefined();
    expect(decadeOf("1990")).toBeUndefined();
  });

  it("maps genre and mood tags to energy", () => {
    expect(tagEnergy("Heavy Metal")).toBeGreaterThan(0.9);
    expect(tagEnergy("ambient")).toBeLessThan(0.15);
    expect(tagEnergy("lo-fi chill")).toBeLessThan(0.3);
    expect(tagEnergy("seen live")).toBeUndefined();
  });

  it("puts a release year on the era axis", () => {
    expect(eraOf(1990)).toBeLessThan(eraOf(2020));
    expect(eraOf(1900)).toBe(0);
    expect(eraOf(2100)).toBe(1);
    const old = vec(track("a"), { year: 1995 });
    const recent = vec(track("b"), { year: 2022 });
    expect(inMood("retro", old) && !inMood("modern", old)).toBe(true);
    expect(inMood("modern", recent) && !inMood("retro", recent)).toBe(true);
  });

  it("puts mood lists, tags and decade lists on their axes", () => {
    expect(inMood("chill", vec(track("a"), { lists: ["sleep"] }))).toBe(true);
    expect(inMood("loud", vec(track("a"), { lists: ["workout"] }))).toBe(true);
    expect(inMood("loud", vec(track("a"), { tags: ["metal", "rock"] }))).toBe(
      true,
    );
    expect(inMood("retro", vec(track("a"), { lists: ["decade:1990"] }))).toBe(
      true,
    );
    expect(inMood("retro", vec(track("a"), { tags: ["90s"] }))).toBe(true);
  });

  it("puts nothing in a mood without evidence", () => {
    const none = vec(track("a"), {});
    expect(none.confidence).toBe(0);
    for (const m of ["retro", "chill", "loud", "modern"] as const)
      expect(inMood(m, none)).toBe(false);
  });

  it("treats a title word alone as too weak", () => {
    const party = vec(track("a", { title: "Party mix" }), {});
    expect(inMood("loud", party)).toBe(false);
  });

  it("lets a release year outweigh a long tag list", () => {
    const tags = Array.from({ length: 10 }, () => "2000s");
    const v = vec(track("a"), { year: 1994, tags });
    expect(inMood("retro", v)).toBe(true);
  });

  it("pulls a song toward the songs played around it", () => {
    const alone = vec(track("a"), { year: 2020 });
    const near = vec(track("a"), { year: 2020 }, [
      vec(track("b"), { year: 1990 }),
      vec(track("c"), { year: 1990 }),
    ]);
    expect(near.era).toBeLessThan(alone.era);
    expect(near.era).toBeGreaterThan(vec(track("d"), { year: 1990 }).era);
  });
});

describe("sessionNeighbours", () => {
  const play = (id: string, minutesAgo: number): Play => ({
    track: track(id),
    at: NOW - minutesAgo * MIN,
  });

  it("links songs played back to back and not across a break", () => {
    const near = sessionNeighbours([
      play("a", 0),
      play("b", 4),
      play("c", 8),
      play("d", 300),
    ]);
    const of = (id: string) => near.get(`${id}|a ${id}`) ?? [];
    expect(of("b").sort()).toEqual(["a|a a", "c|a c"]);
    expect(of("a")).toEqual(["b|a b", "c|a c"]);
    expect(of("d")).toEqual([]);
  });
});

describe("isAllowed", () => {
  const open: Filters = {
    dropped: new Set(),
    explicit: false,
    words: [],
    blocked: new Set(),
  };

  it("keeps dislikes, explicit songs, blocked words and artists, and long streams out", () => {
    expect(isAllowed(track("a"), open)).toBe(true);
    expect(isAllowed(track("a"), { ...open, dropped: new Set(["a"]) })).toBe(
      false,
    );
    expect(isAllowed(track("a", { explicit: true }), open)).toBe(true);
    expect(
      isAllowed(track("a", { explicit: true }), { ...open, explicit: true }),
    ).toBe(false);
    expect(
      isAllowed(track("nightcore a"), { ...open, words: ["nightcore"] }),
    ).toBe(false);
    expect(
      isAllowed(track("a", {}, "Some Band"), {
        ...open,
        blocked: new Set(["some band"]),
      }),
    ).toBe(false);
    expect(isAllowed(track("a", { durationSec: 3 * 3600 }), open)).toBe(false);
  });
});

describe("pickMix", () => {
  const retro = (prefix: string, n: number, ev = { year: 1994 }) =>
    Array.from({ length: n }, (_, i) => item(`${prefix}${i}`, ev));
  const own = [...retro("own", 10), ...retro("new", 3, { year: 2022 })];
  const finds = retro("find", 10, { year: 1996 });
  const mix = (share: number, f = finds) =>
    ids(
      pickMix({
        mood: "retro",
        own,
        finds: f,
        share,
        n: 6,
        random: seeded(7),
      }),
    );

  it("takes only songs that fit the mood", () => {
    expect(mix(0).every((id) => id.startsWith("own"))).toBe(true);
  });

  it("splits the mix by the share of new finds", () => {
    expect(mix(1).every((id) => id.startsWith("find"))).toBe(true);
    const half = mix(0.5);
    expect(half.filter((id) => id.startsWith("find"))).toHaveLength(3);
    expect(half).toHaveLength(6);
  });

  it("fills from the other side when one runs short", () => {
    const out = mix(1, []);
    expect(out).toHaveLength(6);
    expect(out.every((id) => id.startsWith("own"))).toBe(true);
  });

  it("is repeatable with a seed and varies with another", () => {
    expect(mix(0.5)).toEqual(mix(0.5));
    const other = ids(
      pickMix({
        mood: "retro",
        own,
        finds,
        share: 0.5,
        n: 6,
        random: seeded(8),
      }),
    );
    expect(other).not.toEqual(mix(0.5));
  });

  it("keeps two songs per artist at most", () => {
    const same = Array.from({ length: 8 }, (_, i) => ({
      track: track(`s${i}`, {}, "one artist"),
      vector: vec(track("x"), { year: 1994 }),
    }));
    const out = pickMix({
      mood: "retro",
      own: same,
      finds: [],
      share: 0,
      n: 6,
    });
    expect(out).toHaveLength(2);
  });
});
