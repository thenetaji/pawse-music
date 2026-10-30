import { daysText, nextOccurrence, toggleDay, wrap } from "./alarm-core";

// Thursday 29 October 2026.
const at = (d: number, h: number, m = 0) =>
  new Date(2026, 9, d, h, m).getTime();

describe("nextOccurrence", () => {
  it("rings today when the time is still ahead", () => {
    expect(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(29, 6))).toBe(
      at(29, 7, 30),
    );
  });

  it("rings tomorrow when the time has passed", () => {
    expect(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(29, 8))).toBe(
      at(30, 7, 30),
    );
  });

  it("skips to the next chosen weekday", () => {
    // Monday and Wednesday, asked on a Thursday.
    expect(
      nextOccurrence({ hour: 7, minute: 0, days: [1, 3] }, at(29, 8)),
    ).toBe(at(31 + 2, 7));
  });

  it("does not ring twice in the same minute", () => {
    expect(nextOccurrence({ hour: 7, minute: 0, days: [4] }, at(29, 7))).toBe(
      at(29 + 7, 7),
    );
  });
});

describe("days", () => {
  it("toggles and keeps the week in order", () => {
    expect(toggleDay([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("names common sets", () => {
    expect(daysText([])).toBe("Once");
    expect(daysText([1, 2, 3, 4, 5])).toBe("Weekdays");
    expect(daysText([0, 6])).toBe("Weekends");
    expect(daysText([1, 4])).toBe("Mon, Thu");
  });
});

describe("wrap", () => {
  it("wraps both ways", () => {
    expect(wrap(24, 24)).toBe(0);
    expect(wrap(-1, 24)).toBe(23);
  });
});
