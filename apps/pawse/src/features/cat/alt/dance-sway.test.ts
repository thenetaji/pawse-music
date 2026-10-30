import { advanceBeat, snapToBeat, sway } from "./dance-sway";

describe("advanceBeat", () => {
  it("counts one beat per beat length and wraps after a pair", () => {
    expect(advanceBeat(0, 260, 520)).toBeCloseTo(0.5);
    expect(advanceBeat(1.9, 104, 520)).toBeCloseTo(0.1);
  });

  it("runs faster for a shorter beat", () => {
    expect(advanceBeat(0, 16, 330)).toBeGreaterThan(advanceBeat(0, 16, 750));
  });
});

describe("snapToBeat", () => {
  it("moves part of the way to the nearest whole beat", () => {
    expect(snapToBeat(0.8, 0.5)).toBeCloseTo(0.9);
    expect(snapToBeat(1.2, 0.5)).toBeCloseTo(1.1);
  });

  it("wraps across the end of the pair", () => {
    expect(snapToBeat(1.9, 0.5)).toBeCloseTo(1.95);
    expect(snapToBeat(0.05, 0.5)).toBeCloseTo(0.025);
  });

  it("leaves a hit that is already on the beat alone", () => {
    expect(snapToBeat(1, 0.5)).toBeCloseTo(1);
  });
});

describe("sway", () => {
  it("is on the ground at each beat and highest between two", () => {
    expect(sway(0, 1).lift).toBe(0);
    expect(sway(1, 1).lift).toBeCloseTo(0);
    expect(sway(0.5, 1).lift).toBeCloseTo(1);
    expect(sway(1.5, 1).lift).toBeCloseTo(1);
  });

  it("leans one way, then the other, over two beats", () => {
    expect(sway(0.5, 1).tilt).toBeCloseTo(1);
    expect(sway(1.5, 1).tilt).toBeCloseTo(-1);
    expect(sway(0, 1).tilt).toBeCloseTo(0);
  });

  it("moves less for a quiet song, but still moves", () => {
    const quiet = sway(0.5, 0);
    const loud = sway(0.5, 1);
    expect(quiet.lift).toBeGreaterThan(0);
    expect(quiet.lift).toBeLessThan(loud.lift);
  });

  it("has no jump where the pair wraps", () => {
    const end = sway(2 - 1e-6, 0.6);
    const start = sway(0, 0.6);
    expect(end.lift).toBeCloseTo(start.lift, 4);
    expect(end.tilt).toBeCloseTo(start.tilt, 4);
  });
});
