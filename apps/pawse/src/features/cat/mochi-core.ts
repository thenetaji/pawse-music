import { dayKey } from "../mindful/mindful-core";

export const STREAK_MINUTES = 10;

export type Digest = { startedAt: number; listenedMs: number; artist: string };

export type MochiStats = {
  streak: number;
  best: number;
  today: number;
  hours: number;
  artists: number;
};

export type Slot = "hat" | "cups" | "idle";
type Need = { kind: "streak" | "hours" | "artists"; n: number };
export type Item = {
  id: string;
  slot: Slot;
  name: string;
  need?: Need;
  cups?: [string, string];
};

export const ITEMS: Item[] = [
  { id: "none", slot: "hat", name: "No hat" },
  { id: "beanie", slot: "hat", name: "Beanie", need: { kind: "streak", n: 3 } },
  {
    id: "party",
    slot: "hat",
    name: "Party hat",
    need: { kind: "hours", n: 10 },
  },
  { id: "crown", slot: "hat", name: "Crown", need: { kind: "streak", n: 30 } },
  { id: "artwork", slot: "cups", name: "Match the song" },
  { id: "violet", slot: "cups", name: "Violet", cups: ["#8B7CFF", "#4B3BD6"] },
  {
    id: "mint",
    slot: "cups",
    name: "Mint",
    cups: ["#7CF0C8", "#1FA67F"],
    need: { kind: "streak", n: 2 },
  },
  {
    id: "rose",
    slot: "cups",
    name: "Rose",
    cups: ["#FF8FB0", "#D93A6D"],
    need: { kind: "streak", n: 7 },
  },
  {
    id: "gold",
    slot: "cups",
    name: "Gold",
    cups: ["#FFE08A", "#D9A021"],
    need: { kind: "streak", n: 14 },
  },
  {
    id: "sky",
    slot: "cups",
    name: "Sky",
    cups: ["#9BDCFF", "#2F8CE0"],
    need: { kind: "hours", n: 25 },
  },
  {
    id: "sunset",
    slot: "cups",
    name: "Sunset",
    cups: ["#FFB36B", "#E8486A"],
    need: { kind: "artists", n: 50 },
  },
  { id: "sleep", slot: "idle", name: "Napping" },
  { id: "purr", slot: "idle", name: "Purring", need: { kind: "streak", n: 5 } },
  {
    id: "curious",
    slot: "idle",
    name: "Peeking around",
    need: { kind: "artists", n: 25 },
  },
  {
    id: "vibe",
    slot: "idle",
    name: "Dreaming of music",
    need: { kind: "hours", n: 50 },
  },
];

export const itemsFor = (slot: Slot) => ITEMS.filter((i) => i.slot === slot);
export const findItem = (slot: Slot, id: string) =>
  ITEMS.find((i) => i.slot === slot && i.id === id);

const shiftDay = (key: string, by: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + by, 12).getTime());
};

export function mochiStats(plays: Digest[], now: number): MochiStats {
  const minutes = new Map<string, number>();
  const artists = new Set<string>();
  let ms = 0;
  for (const p of plays) {
    const key = dayKey(p.startedAt);
    minutes.set(key, (minutes.get(key) ?? 0) + p.listenedMs / 60_000);
    ms += p.listenedMs;
    if (p.artist) artists.add(p.artist.toLowerCase());
  }
  const counted = [...minutes]
    .filter(([, m]) => m >= STREAK_MINUTES)
    .map(([k]) => k)
    .sort();
  let best = 0;
  let run = 0;
  counted.forEach((k, i) => {
    run = i > 0 && shiftDay(counted[i - 1], 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
  });
  // Today may still be reached, so a streak that ended yesterday stays alive until midnight.
  const today = dayKey(now);
  const have = new Set(counted);
  let at = have.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (have.has(at)) {
    streak++;
    at = shiftDay(at, -1);
  }
  return {
    streak,
    best,
    today: Math.floor(minutes.get(today) ?? 0),
    hours: ms / 3_600_000,
    artists: artists.size,
  };
}

const value = (s: MochiStats, kind: Need["kind"]) =>
  kind === "streak" ? s.best : kind === "hours" ? s.hours : s.artists;

export const isEarned = (item: Item, s: MochiStats) =>
  !item.need || value(s, item.need.kind) >= item.need.n;

export const earnedIds = (s: MochiStats) =>
  ITEMS.filter((i) => i.need && isEarned(i, s)).map((i) => i.id);

export function needText(item: Item): string {
  if (!item.need) return "";
  const { kind, n } = item.need;
  if (kind === "streak") return `${n}-day streak`;
  if (kind === "hours") return `${n} hours of music`;
  return `${n} artists`;
}

export function progressText(item: Item, s: MochiStats): string {
  if (!item.need) return "";
  const have = Math.floor(value(s, item.need.kind));
  return `${needText(item)} (${Math.min(have, item.need.n)} of ${item.need.n})`;
}
