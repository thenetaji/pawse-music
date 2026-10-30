export const LIMITS = [0, 30, 60, 120, 180];
export const MORE_SEC = 300;
export const WARN_SEC = 300;
const KEEP_DAYS = 28;

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lastDays(n: number, now: number): string[] {
  const today = new Date(now);
  return Array.from({ length: n }, (_, i) =>
    dayKey(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - (n - 1 - i),
        12,
      ).getTime(),
    ),
  );
}

export function secondsLeft(
  limitMin: number,
  moreSec: number,
  watchedSec: number,
): number {
  return limitMin > 0 ? limitMin * 60 + moreSec - watchedSec : Infinity;
}

export function addSeconds(
  days: Record<string, number>,
  key: string,
  sec: number,
): Record<string, number> {
  const next = { ...days, [key]: (days[key] ?? 0) + sec };
  const keys = Object.keys(next).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS)))
    delete next[old];
  return next;
}

export function formatWatch(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

const WORDS: Record<number, string> = {
  30: "half hour",
  60: "hour",
  120: "two hours",
  180: "three hours",
};

export function limitWord(limitMin: number): string {
  return WORDS[limitMin] ?? `${limitMin} minutes`;
}

export function limitLabel(limitMin: number): string {
  return limitMin === 0 ? "Off" : formatWatch(limitMin * 60);
}
