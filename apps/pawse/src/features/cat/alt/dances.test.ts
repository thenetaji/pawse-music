import { DANCES, nextDance } from "./dances";

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
