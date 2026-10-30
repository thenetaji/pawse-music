import type { Track } from "@pawse/music-core";

import type { Vector } from "../data/moods";
import { distance } from "../data/moods";
import { nextDrift, smoothOrder } from "./smooth-shuffle";

jest.mock("../data/clients", () => ({
  yt: {},
  dropExplicit: (v: unknown) => v,
}));
jest.mock("../data/library", () => ({ useLibrary: { getState: jest.fn() } }));
jest.mock("../data/signals", () => ({ useSignals: { getState: jest.fn() } }));
jest.mock("./use-resource", () => ({ useResource: jest.fn() }));

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const track = (id: string, artist = `a-${id}`): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [{ name: artist }],
  durationSec: 200,
  thumbnails: [],
});
const grid = Array.from({ length: 40 }, (_, i) => ({
  track: track(`t${i}`),
  vector: {
    era: ((i * 7) % 40) / 40,
    energy: ((i * 13) % 40) / 40,
    confidence: 1,
  } as Vector,
}));
const vectors = new Map(grid.map((g) => [g.track.id, g.vector]));
const vectorOf = (t: Track) => vectors.get(t.id)!;
const tracks = grid.map((g) => g.track);
const ids = (ts: Track[]) => ts.map((t) => t.id);

const meanStep = (order: Track[]) => {
  let sum = 0;
  for (let i = 1; i < order.length; i++)
    sum += distance(vectorOf(order[i - 1]), vectorOf(order[i]));
  return sum / (order.length - 1);
};

describe("smoothOrder", () => {
  it("plays every song once, starting with the current one", () => {
    const out = smoothOrder(tracks, {
      vectorOf,
      start: tracks[5],
      random: seeded(1),
    });
    expect(out[0].id).toBe("t5");
    expect(new Set(ids(out)).size).toBe(tracks.length);
  });

  it("never repeats a song that appears twice", () => {
    vectors.set("dup", vectorOf(tracks[0]));
    const twice = [...tracks, { ...tracks[0], id: "dup" }, tracks[3]];
    const out = smoothOrder(twice, { vectorOf, random: seeded(2) });
    expect(out).toHaveLength(tracks.length);
    expect(new Set(ids(out)).size).toBe(out.length);
  });

  it("leaves out songs that are not allowed", () => {
    const out = smoothOrder(tracks, {
      vectorOf,
      allowed: (t) => t.id !== "t9",
      random: seeded(3),
    });
    expect(ids(out)).not.toContain("t9");
    expect(out).toHaveLength(tracks.length - 1);
  });

  it("moves in smaller steps than a plain shuffle", () => {
    const smooth = smoothOrder(tracks, { vectorOf, random: seeded(4) });
    const random = seeded(4);
    const plain = [...tracks];
    for (let i = plain.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [plain[i], plain[j]] = [plain[j], plain[i]];
    }
    expect(meanStep(smooth)).toBeLessThan(meanStep(plain) * 0.6);
  });

  it("is repeatable with a seed and differs with another", () => {
    const run = (s: number) =>
      ids(smoothOrder(tracks, { vectorOf, random: seeded(s) }));
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it("does not play one artist back to back while others are near", () => {
    const same = tracks.map((t, i) => ({
      ...t,
      artists: [{ name: `artist ${i % 8}` }],
    }));
    const out = smoothOrder(same, { vectorOf, random: seeded(7) });
    const back = out.filter(
      (t, i) => i > 0 && t.artists[0].name === out[i - 1].artists[0].name,
    );
    expect(back.length).toBeLessThan(4);
  });

  it("handles an empty or single-song list", () => {
    expect(smoothOrder([], { vectorOf })).toEqual([]);
    expect(ids(smoothOrder([tracks[0]], { vectorOf }))).toEqual(["t0"]);
    expect(ids(smoothOrder([], { vectorOf, start: tracks[1] }))).toEqual([
      "t1",
    ]);
  });
});

describe("nextDrift", () => {
  it("moves a little per song and stays on the map", () => {
    let d = { era: 0.5, energy: 0.5, heading: 0 };
    const random = seeded(9);
    for (let i = 0; i < 200; i++) {
      const next = nextDrift(d, 3.5, random);
      expect(Math.hypot(next.era - d.era, next.energy - d.energy)).toBeLessThan(
        0.1,
      );
      expect(next.era).toBeGreaterThanOrEqual(0);
      expect(next.era).toBeLessThanOrEqual(1);
      expect(next.energy).toBeGreaterThanOrEqual(0);
      expect(next.energy).toBeLessThanOrEqual(1);
      d = next;
    }
  });
});
