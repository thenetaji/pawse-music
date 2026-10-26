// YouTube heads its watch history by day; this turns a heading back into a time.
const DAY_MS = 86_400_000;
const MONTH_DAY =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** When a day heading ("Today", "Monday", "Oct 3") ends; undefined when it can't be read. */
export function dayEnd(
  day: string | undefined,
  now: number,
): number | undefined {
  if (!day) return undefined;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const d = day.trim().toLowerCase();
  if (d === "today") return now;
  if (d === "yesterday") return start;
  const wd = WEEKDAYS.indexOf(d);
  if (wd >= 0) {
    const back = (today.getDay() - wd + 7) % 7 || 7;
    return start - (back - 1) * DAY_MS;
  }
  // Only a month name beside a day number: the date parser reads almost any word as some date.
  if (!MONTH_DAY.test(day)) return undefined;
  const withYear = /\d{4}/.test(day) ? day : `${day} ${today.getFullYear()}`;
  const t = Date.parse(withYear);
  if (Number.isNaN(t)) return undefined;
  // "Dec 30" read in January is last year's.
  const end = t + DAY_MS;
  return end > now + DAY_MS ? end - 365 * DAY_MS : Math.min(end, now);
}
