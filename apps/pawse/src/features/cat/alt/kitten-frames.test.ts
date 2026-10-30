import { JUMP_MS, kittenFrame, SHEET } from "./kitten-frames";

const cells = SHEET.cols * SHEET.rows;

describe("kittenFrame", () => {
  it("idles while paused", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 2000; t += 50)
      seen.add(kittenFrame(false, t, 520, 0).index);
    expect([...seen].every((i) => i < 6)).toBe(true);
    expect(seen.size).toBe(6);
  });

  it("runs while playing, faster for a faster beat", () => {
    const count = (beatMs: number) => {
      let changes = 0;
      let last = -1;
      for (let t = 0; t < 2000; t += 10) {
        const i = kittenFrame(true, t, beatMs, 0).index;
        if (i !== last) changes++;
        last = i;
      }
      return changes;
    };
    expect(kittenFrame(true, 0, 520, 0).index).toBeGreaterThanOrEqual(6);
    expect(kittenFrame(true, 0, 520, 0).index).toBeLessThan(16);
    expect(count(330)).toBeGreaterThan(count(750));
  });

  it("jumps once from the moment it is asked, then goes back", () => {
    const start = 100_000;
    expect(kittenFrame(true, start + 1, 520, start).index).toBe(16);
    expect(kittenFrame(false, start + JUMP_MS - 1, 520, start).index).toBe(21);
    expect(kittenFrame(true, start + JUMP_MS / 2, 520, start).lift).toBeCloseTo(
      1,
    );
    expect(kittenFrame(true, start + JUMP_MS + 1, 520, start).lift).toBe(0);
    expect(
      kittenFrame(false, start + JUMP_MS + 1, 520, start).index,
    ).toBeLessThan(6);
  });

  it("only picks frames that are on the sheet", () => {
    for (let t = 0; t < 5000; t += 37)
      for (const playing of [true, false]) {
        const { index } = kittenFrame(playing, t, 520, t % 700 < 300 ? t : 0);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(cells);
      }
  });
});
