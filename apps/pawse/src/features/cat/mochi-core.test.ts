import {
  type Digest,
  earnedIds,
  isEarned,
  ITEMS,
  mochiStats,
  progressText,
} from "./mochi-core";

const at = (m: number, d: number, h = 12) => new Date(2026, m, d, h).getTime();
const day = (m: number, d: number, minutes: number, artist = "A"): Digest => ({
  startedAt: at(m, d),
  listenedMs: minutes * 60_000,
  artist,
});

describe("mochiStats streaks", () => {
  it("counts days in a row with ten minutes of music", () => {
    const plays = [day(9, 27, 12), day(9, 28, 30), day(9, 29, 10)];
    expect(mochiStats(plays, at(9, 29, 20)).streak).toBe(3);
  });

  it("adds up several plays on one day", () => {
    const plays = [day(9, 28, 4), day(9, 28, 4), day(9, 28, 3)];
    expect(mochiStats(plays, at(9, 28, 20)).streak).toBe(1);
  });

  it("keeps yesterday's streak alive until midnight", () => {
    const plays = [day(9, 27, 15), day(9, 28, 15), day(9, 29, 3)];
    const s = mochiStats(plays, at(9, 29, 20));
    expect(s.streak).toBe(2);
    expect(s.today).toBe(3);
  });

  it("breaks after a missed day but remembers the best run", () => {
    const plays = [
      day(9, 20, 20),
      day(9, 21, 20),
      day(9, 22, 20),
      day(9, 23, 20),
      day(9, 27, 20),
    ];
    const s = mochiStats(plays, at(9, 29, 9));
    expect(s.streak).toBe(0);
    expect(s.best).toBe(4);
  });

  it("runs across a month end", () => {
    const plays = [day(9, 31, 20), day(10, 1, 20), day(10, 2, 20)];
    expect(mochiStats(plays, at(10, 2, 22)).streak).toBe(3);
  });
});

describe("mochiStats totals", () => {
  it("counts hours and distinct artists ignoring case", () => {
    const plays = [
      day(9, 27, 90, "Daft Punk"),
      day(9, 28, 30, "daft punk"),
      day(9, 28, 30, "Air"),
    ];
    const s = mochiStats(plays, at(9, 29));
    expect(s.hours).toBeCloseTo(2.5);
    expect(s.artists).toBe(2);
  });
});

describe("unlocks", () => {
  it("unlocks by the best streak, hours and artists", () => {
    const s = { streak: 0, best: 7, today: 0, hours: 12, artists: 3 };
    const ids = earnedIds(s);
    expect(ids).toEqual(
      expect.arrayContaining(["beanie", "mint", "purr", "rose", "party"]),
    );
    expect(ids).not.toContain("crown");
    expect(ids).not.toContain("sunset");
  });

  it("never asks anything for the free items", () => {
    const s = { streak: 0, best: 0, today: 0, hours: 0, artists: 0 };
    const free = ITEMS.filter((i) => !i.need);
    expect(free.every((i) => isEarned(i, s))).toBe(true);
    expect(earnedIds(s)).toEqual([]);
  });

  it("says how far along a locked item is", () => {
    const crown = ITEMS.find((i) => i.id === "crown")!;
    const s = { streak: 2, best: 9, today: 0, hours: 0, artists: 0 };
    expect(progressText(crown, s)).toBe("30-day streak (9 of 30)");
  });
});
