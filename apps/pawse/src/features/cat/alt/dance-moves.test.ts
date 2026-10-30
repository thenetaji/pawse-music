import { type Leg, nextLeg, nextMirror, STOPS } from "./dance-moves";

const never = () => 0.99;
const always = () => 0;

function walk(steps: number, rand: () => number) {
  const legs: Leg[] = [];
  let at = STOPS[0];
  for (let i = 0; i < steps; i++) {
    const leg = nextLeg(at, legs[legs.length - 1], rand);
    legs.push(leg);
    at = leg.to;
  }
  return legs;
}

describe("nextLeg", () => {
  it("plays the file's own order when it never goes back", () => {
    const frames = walk(6, never).map((l) => [l.from, l.to]);
    expect(frames).toEqual([
      [0, 40],
      [40, 50],
      [50, 79],
      [79, 90],
      [0, 40],
      [40, 50],
    ]);
  });

  it("starts every move where the last one stopped", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const legs = walk(300, rand);
    legs.slice(1).forEach((leg, i) => {
      const end = legs[i].to;
      const same = leg.from === end || [leg.from, end].sort().join() === "0,90";
      expect(same).toBe(true);
    });
    expect(legs.every((l) => STOPS.includes(l.from))).toBe(true);
    expect(legs.every((l) => STOPS.includes(l.to))).toBe(true);
    expect(legs.some((l) => l.back)).toBe(true);
  });

  it("plays the move it just made backwards, then carries on", () => {
    const first = nextLeg(0, undefined, always);
    expect(first).toEqual({ from: 0, to: 40, back: false });
    const back = nextLeg(40, first, always);
    expect(back).toEqual({ from: 40, to: 0, back: true });
    expect(nextLeg(0, back, always)).toEqual({ from: 0, to: 40, back: false });
  });

  it("goes back from the front rest by unwinding the last spin", () => {
    const legs = [nextLeg(0, undefined, never)];
    expect(nextLeg(90, legs[0], always)).toEqual({
      from: 90,
      to: 79,
      back: true,
    });
  });

  it("never plays two backward moves in a row", () => {
    let seed = 3;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const legs = walk(500, () => rand() * 0.3);
    legs.slice(1).forEach((leg, i) => {
      expect(leg.back && legs[i].back).toBe(false);
    });
  });
});

describe("nextMirror", () => {
  it("only turns around at the front rest", () => {
    expect(nextMirror(0, false, always)).toBe(true);
    expect(nextMirror(90, true, always)).toBe(false);
    for (const at of [40, 50, 79])
      expect(nextMirror(at, false, always)).toBe(false);
  });

  it("keeps its side when the dice say so", () => {
    expect(nextMirror(0, true, never)).toBe(true);
    expect(nextMirror(0, false, never)).toBe(false);
  });
});
