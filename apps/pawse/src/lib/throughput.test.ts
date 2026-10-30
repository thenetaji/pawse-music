import { createSpeedGate } from "./throughput";

const feed = (
  gate: ReturnType<typeof createSpeedGate>,
  kbps: number[],
  from = 0,
) => kbps.map((k, i) => gate.note(k, from + i * 1000));

describe("speed gate", () => {
  test("steps down only after several slow readings in a row", () => {
    const gate = createSpeedGate();
    expect(feed(gate, [90, 120, 80])).toEqual([false, false, false]);
    expect(gate.isLow(3000)).toBe(false);
    expect(gate.note(100, 3000)).toBe(true);
    expect(gate.isLow(3000)).toBe(true);
  });

  test("a reading at playback speed or better never counts as a crawl", () => {
    const gate = createSpeedGate();
    feed(gate, [150, 260, 180, 220, 190]);
    expect(gate.isLow(5000)).toBe(false);
  });

  test("slow readings far apart are not one crawl", () => {
    const gate = createSpeedGate();
    for (const [i, at] of [0, 20_000, 40_000, 60_000].entries())
      gate.note(50 + i, at);
    expect(gate.isLow(60_000)).toBe(false);
  });

  test("one fast reading brings the quality back at once", () => {
    const gate = createSpeedGate();
    feed(gate, [50, 50, 50, 50]);
    expect(gate.isLow(4000)).toBe(true);
    expect(gate.note(900, 5000)).toBe(true);
    expect(gate.isLow(5000)).toBe(false);
  });

  test("it ends by itself after two minutes if nothing more is learned", () => {
    const gate = createSpeedGate();
    feed(gate, [50, 50, 50, 50]);
    expect(gate.isLow(3000 + 119_000)).toBe(true);
    expect(gate.isLow(3000 + 121_000)).toBe(false);
  });
});
