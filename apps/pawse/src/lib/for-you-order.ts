// How many leading videos of a refresh count as shown, and how many refreshes they stay demoted for.
export const TOP_SHOWN = 10;
export const TOP_REFRESHES = 3;
// Past the first page, everything handed out was scrolled to; on it, only the head is.
const FIRST_PAGE_SHOWN = 12;
export const MAX_RECENT = 300;

export type Seen = {
  /** Every video shown lately, oldest first. */
  recent: string[];
  /** The leading videos of the last refreshes, newest first. */
  tops: string[][];
};

/**
 * New videos first, then ones shown lower down before, then the ones that led a recent refresh, the longest
 * ago first: so a refresh never opens on what the last few opened on. Order within a group is kept.
 */
export function orderFeed<T extends { id: string }>(
  picked: T[],
  seen: Seen,
): T[] {
  const offered = new Set(seen.recent);
  const topAge = new Map<string, number>();
  seen.tops.slice(0, TOP_REFRESHES).forEach((ids, age) => {
    for (const id of ids) if (!topAge.has(id)) topAge.set(id, age);
  });
  const fresh: T[] = [];
  const lower: T[] = [];
  const led: T[] = [];
  for (const v of picked) {
    if (topAge.has(v.id)) led.push(v);
    else if (offered.has(v.id)) lower.push(v);
    else fresh.push(v);
  }
  led.sort((a, b) => topAge.get(b.id)! - topAge.get(a.id)!);
  return [...fresh, ...lower, ...led];
}

/** What a page that went on screen adds to the memory: its head and, past the first page, all of it. */
export function noteShown(seen: Seen, ids: string[], first: boolean): Seen {
  const shown = first ? ids.slice(0, FIRST_PAGE_SHOWN) : ids;
  const recent = [...seen.recent.filter((id) => !shown.includes(id)), ...shown];
  return {
    recent: recent.slice(-MAX_RECENT),
    tops: first
      ? [ids.slice(0, TOP_SHOWN), ...seen.tops].slice(0, TOP_REFRESHES)
      : seen.tops,
  };
}
