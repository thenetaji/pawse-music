import {
  addSeconds,
  dayKey,
  formatWatch,
  lastDays,
  limitWord,
  secondsLeft,
} from "./mindful-core";

describe("dayKey", () => {
  it("rolls over at local midnight", () => {
    expect(dayKey(new Date(2026, 9, 29, 23, 59, 59).getTime())).toBe(
      "2026-10-29",
    );
    expect(dayKey(new Date(2026, 9, 30, 0, 0, 1).getTime())).toBe("2026-10-30");
  });
});

describe("lastDays", () => {
  it("ends today and crosses month ends", () => {
    const now = new Date(2026, 10, 2, 9).getTime();
    expect(lastDays(4, now)).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});

describe("secondsLeft", () => {
  it("counts down from the limit plus granted time", () => {
    expect(secondsLeft(60, 0, 3000)).toBe(600);
    expect(secondsLeft(60, 300, 3900)).toBe(0);
    expect(secondsLeft(30, 0, 2000)).toBe(-200);
  });

  it("never runs out without a limit", () => {
    expect(secondsLeft(0, 0, 99999)).toBe(Infinity);
  });
});

describe("addSeconds", () => {
  it("adds to the day and keeps four weeks", () => {
    let days: Record<string, number> = {};
    for (let i = 1; i <= 30; i++)
      days = addSeconds(days, `2026-09-${String(i).padStart(2, "0")}`, 60);
    days = addSeconds(days, "2026-09-30", 30);
    expect(Object.keys(days)).toHaveLength(28);
    expect(days["2026-09-30"]).toBe(90);
    expect(days["2026-09-01"]).toBeUndefined();
  });
});

describe("formatWatch", () => {
  it("reads like a person would say it", () => {
    expect(formatWatch(0)).toBe("0 min");
    expect(formatWatch(45 * 60)).toBe("45 min");
    expect(formatWatch(3600)).toBe("1 h");
    expect(formatWatch(4800)).toBe("1 h 20 min");
  });
});

describe("limitWord", () => {
  it("names the limits", () => {
    expect(limitWord(60)).toBe("hour");
    expect(limitWord(120)).toBe("two hours");
  });
});
