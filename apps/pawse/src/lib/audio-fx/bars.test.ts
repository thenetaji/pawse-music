import {
  BAR_COUNT,
  barLevels,
  easeLevels,
  meterDead,
  synthBands,
  trackBands,
  unit,
} from "./bars";

jest.mock("../../../modules/pawse-audio", () => ({ LEVEL_BANDS: 16 }));
jest.mock("./index", () => ({ holdMeter: jest.fn(), readLevels: jest.fn() }));

const FRAME = 33;

type Ranges = ReturnType<typeof trackBands>["ranges"];

// Feeds `frames` identical-length steps of `dbAt(step)` and returns the last result.
function run(
  frames: number,
  dbAt: (step: number) => number[],
  from: Ranges = [],
  offset = 0,
) {
  let ranges = from;
  let levels: number[] = [];
  for (let n = 0; n < frames; n++) {
    ({ ranges, levels } = trackBands(ranges, dbAt(offset + n), FRAME));
  }
  return { ranges, levels };
}

const seconds = (s: number) => Math.round((s * 1000) / FRAME);

describe("easeLevels", () => {
  it("rises faster than it falls", () => {
    const up = easeLevels([0], [1], 60)[0];
    const down = easeLevels([1], [0], 60)[0];
    expect(up).toBeGreaterThan(0.6);
    expect(1 - down).toBeLessThan(0.3);
  });
});

describe("trackBands", () => {
  const wave = (mid: number, step: number) =>
    mid + 7 * Math.sin((step * FRAME * 2 * Math.PI) / 500);

  it("gives bands at very different loudness the same swing", () => {
    const frames = seconds(8);
    const { ranges } = run(frames, (n) => [wave(-20, n), wave(-55, n)]);
    const peaks = run(
      seconds(0.5),
      (n) => [wave(-20, n), wave(-55, n)],
      ranges,
      frames,
    );
    const [loud, quiet] = peaks.levels;
    expect(Math.abs(loud - quiet)).toBeLessThan(0.1);
    expect(quiet).toBeGreaterThan(0);
  });

  it("does not leave a steady band pinned at full height", () => {
    const { levels } = run(seconds(12), () => [-20]);
    expect(levels[0]).toBeLessThanOrEqual(0.8 + 1e-9);
  });

  it("starts bands at their own distance from the average", () => {
    const { levels } = trackBands([], [-20, -40, -60], FRAME);
    expect(levels[0]).toBeGreaterThan(levels[1]);
    expect(levels[1]).toBeGreaterThan(levels[2]);
  });

  it("lets a sudden jump pop more than the same rise made slowly", () => {
    const steady = run(seconds(4), () => [-40, -40]);
    const jump = run(1, () => [-30, -40], steady.ranges).levels[0];
    const ramp = run(
      seconds(3),
      (n) => [-40 + (10 * n) / seconds(3), -40],
      steady.ranges,
    ).levels[0];
    expect(jump).toBeGreaterThan(ramp);
  });

  it("lets a quiet passage fill the range once the old peak has faded", () => {
    const loud = run(1, () => [-10], run(seconds(4), () => [-30]).ranges);
    const right = run(1, () => [-30], loud.ranges).levels[0];
    const later = run(seconds(10), () => [-30], loud.ranges).levels[0];
    expect(right).toBeLessThan(0.3);
    expect(later).toBeGreaterThan(0.6);
  });

  it("reads silence as zero and keeps what it learned", () => {
    const learned = run(seconds(4), () => [-30, -30]);
    const quiet = trackBands(learned.ranges, [-120, -30], FRAME);
    expect(quiet.levels[0]).toBe(0);
    expect(quiet.ranges[0]).toEqual(learned.ranges[0]);
  });
});

describe("meterDead", () => {
  const floor = Array(16).fill(-120);
  it("is true for a meter at its floor that never heard silence", () => {
    expect(meterDead({ silentMs: 0, db: -120, bands: floor })).toBe(true);
  });
  it("is false for real silence or real music", () => {
    expect(meterDead({ silentMs: 300, db: -120, bands: floor })).toBe(false);
    expect(
      meterDead({ silentMs: 0, db: -12, bands: [...floor.slice(1), -30] }),
    ).toBe(false);
  });
});

describe("barLevels", () => {
  it("runs from the lows on the left to the highs on the right", () => {
    const bands = Array(16).fill(0);
    bands[0] = 1;
    const bars = barLevels(bands, 0);
    expect(bars).toHaveLength(BAR_COUNT);
    expect(bars[0]).toBeGreaterThan(0.4);
    expect(bars[BAR_COUNT - 1]).toBe(0);
  });

  it("gives neighbouring bars their own height from flat bands", () => {
    const bars = barLevels(Array(16).fill(0.5), 1234);
    expect(new Set(bars.map((v) => v.toFixed(3))).size).toBeGreaterThan(
      BAR_COUNT / 2,
    );
    for (const v of bars) {
      expect(v).toBeGreaterThan(0.5 * 0.92 * 0.85 - 1e-9);
      expect(v).toBeLessThan(0.5 * 1.08 * 1.15 + 1e-9);
    }
  });

  it("wobbles slowly and the same way every time", () => {
    const bands = Array(16).fill(0.5);
    expect(barLevels(bands, 5000)).toEqual(barLevels(bands, 5000));
    expect(barLevels(bands, 0)).not.toEqual(barLevels(bands, 4000));
  });

  it("stays at zero while the bands are", () => {
    expect(barLevels(Array(16).fill(0), 777).every((v) => v === 0)).toBe(true);
  });
});

describe("synthBands", () => {
  it("drifts gently, differently per band", () => {
    const now = synthBands(2000, 16);
    expect(now).toHaveLength(16);
    expect(Math.max(...now)).toBeLessThanOrEqual(0.7);
    expect(Math.min(...now)).toBeGreaterThanOrEqual(0);
    expect(new Set(now.map((v) => v.toFixed(3))).size).toBeGreaterThan(8);
    expect(synthBands(2000, 16)).toEqual(now);
    expect(synthBands(3500, 16)).not.toEqual(now);
  });
});

describe("unit", () => {
  it("is stable and in [0, 1)", () => {
    for (let i = 0; i < 40; i++) {
      const v = unit(i, 3);
      expect(v).toBe(unit(i, 3));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
