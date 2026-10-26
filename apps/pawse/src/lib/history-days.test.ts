import { dayEnd } from "./history-days";

// Wednesday 21 October 2026, 15:00 local time.
const now = new Date(2026, 9, 21, 15).getTime();
const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe("dayEnd", () => {
  it("reads YouTube's day headings", () => {
    expect(dayEnd("Today", now)).toBe(now);
    expect(dayEnd("Yesterday", now)).toBe(at(2026, 9, 21));
    expect(dayEnd("Monday", now)).toBe(at(2026, 9, 20));
    expect(dayEnd("Wednesday", now)).toBe(at(2026, 9, 15));
    expect(dayEnd("Oct 3", now)).toBe(at(2026, 9, 4));
    expect(dayEnd("Dec 30, 2025", now)).toBe(at(2025, 11, 31));
  });

  it("puts a late-December heading read in January last year", () => {
    expect(dayEnd("Dec 30", new Date(2027, 0, 5).getTime())).toBe(
      at(2026, 11, 31),
    );
  });

  it("gives up on headings it can't read", () => {
    expect(dayEnd("Hoy", now)).toBeUndefined();
    expect(dayEnd("This week", now)).toBeUndefined();
    expect(dayEnd(undefined, now)).toBeUndefined();
  });
});
