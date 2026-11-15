import { DANCES, danceFor, nextDance } from "./dances";

describe("nextDance", () => {
  it("never repeats the dance that is showing", () => {
    for (let current = 0; current < DANCES.length; current++)
      for (const r of [0, 0.3, 0.6, 0.9999])
        expect(nextDance(current, () => r)).not.toBe(current);
  });

  it("can reach every other dance", () => {
    const seen = new Set<number>();
    for (let i = 0; i < DANCES.length - 1; i++)
      seen.add(nextDance(0, () => (i + 0.5) / (DANCES.length - 1)));
    expect(seen.size).toBe(DANCES.length - 1);
  });
});

describe("danceFor", () => {
  const ids = (vibe: Parameters<typeof danceFor>[0], quiet = false) =>
    [0, 0.25, 0.5, 0.75, 0.9999].map(
      (r) => DANCES[danceFor(vibe, -1, quiet, () => r)].id,
    );

  it("never gives a sad song a laughing or party cat", () => {
    for (const id of ids("sad")) expect(["moon", "night"]).toContain(id);
  });

  it("keeps the giggle for happier songs", () => {
    for (const v of ["sad", "vibe", "love"] as const)
      expect(ids(v)).not.toContain("giggle");
  });

  it("does not repeat the dance showing", () => {
    const moon = DANCES.findIndex((d) => d.id === "moon");
    for (const r of [0, 0.5, 0.9999])
      expect(danceFor("sad", moon, false, () => r)).not.toBe(moon);
  });

  it("goes quiet at night except for hype songs", () => {
    for (const id of ids("groove", true))
      expect(["moon", "night", "mochi", "poses"]).toContain(id);
    expect(ids("hype", true)).toContain("party");
  });
});
