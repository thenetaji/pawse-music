import type { Track } from "@pawse/music-core";

// Our queue model: parallel tracks/keys (keys are unique per entry and double as native mediaIds).
export interface Queue {
  tracks: Track[];
  keys: string[];
  index: number;
  /** Unshuffled key order while shuffle is on. */
  original: string[] | null;
}

let seq = 0;
export const newKey = (): string =>
  `q${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyQueue = (): Queue => ({
  tracks: [],
  keys: [],
  index: 0,
  original: null,
});

export function createQueue(tracks: Track[], startIndex = 0): Queue {
  return {
    tracks: [...tracks],
    keys: tracks.map(newKey),
    index: clamp(startIndex, 0, Math.max(0, tracks.length - 1)),
    original: null,
  };
}

export function insertAt(
  q: Queue,
  at: number,
  items: Track[],
  keys = items.map(newKey),
): Queue {
  const tracks = [...q.tracks];
  const k = [...q.keys];
  tracks.splice(at, 0, ...items);
  k.splice(at, 0, ...keys);
  const index =
    q.tracks.length && at <= q.index ? q.index + items.length : q.index;
  let original = q.original;
  if (original) {
    // In the unshuffled order, new entries go after the entry that now precedes them.
    const prev = k[at - 1];
    const pos = prev ? original.indexOf(prev) + 1 : 0;
    original = [...original];
    original.splice(pos, 0, ...keys);
  }
  return { tracks, keys: k, index, original };
}

export const insertNext = (q: Queue, track: Track, key?: string): Queue =>
  insertAt(
    q,
    q.tracks.length ? q.index + 1 : 0,
    [track],
    key ? [key] : undefined,
  );

export const append = (q: Queue, items: Track[], keys?: string[]): Queue =>
  insertAt(q, q.tracks.length, items, keys);

export function move(q: Queue, from: number, to: number): Queue {
  const n = q.tracks.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return q;
  const tracks = [...q.tracks];
  const keys = [...q.keys];
  tracks.splice(to, 0, ...tracks.splice(from, 1));
  keys.splice(to, 0, ...keys.splice(from, 1));
  let index = q.index;
  if (from === q.index) index = to;
  else if (from < q.index && to >= q.index) index--;
  else if (from > q.index && to <= q.index) index++;
  return { ...q, tracks, keys, index };
}

export function remove(q: Queue, at: number): Queue {
  if (at < 0 || at >= q.tracks.length) return q;
  const key = q.keys[at];
  const tracks = q.tracks.filter((_, i) => i !== at);
  const keys = q.keys.filter((_, i) => i !== at);
  const index = clamp(
    at < q.index ? q.index - 1 : q.index,
    0,
    Math.max(0, tracks.length - 1),
  );
  return {
    tracks,
    keys,
    index,
    original: q.original?.filter((k) => k !== key) ?? null,
  };
}

/** Current entry first, the rest shuffled; remembers the original order. */
export function shuffle(q: Queue, random: () => number = Math.random): Queue {
  if (!q.tracks.length) return q;
  const rest = q.keys.filter((_, i) => i !== q.index);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const keys = [q.keys[q.index], ...rest];
  return {
    tracks: byKeys(q, keys),
    keys,
    index: 0,
    original: q.original ?? [...q.keys],
  };
}

export function unshuffle(q: Queue): Queue {
  if (!q.original) return q;
  const current = q.keys[q.index];
  const keys = q.original.filter((k) => q.keys.includes(k));
  return {
    tracks: byKeys(q, keys),
    keys,
    index: Math.max(0, keys.indexOf(current)),
    original: null,
  };
}

export const remaining = (q: Queue): number =>
  Math.max(0, q.tracks.length - q.index - 1);

/** Radio refill: drop tracks already queued (by track id) and duplicates within the batch. */
export function freshTracks(q: Queue, incoming: Track[]): Track[] {
  const seen = new Set(q.tracks.map((t) => t.id));
  return incoming.filter((t) => !seen.has(t.id) && (seen.add(t.id), true));
}

/** Index a manual next/previous lands on, or null at the edge. */
export function stepIndex(
  len: number,
  index: number,
  dir: 1 | -1,
  wrap: boolean,
): number | null {
  if (!len) return null;
  const to = index + dir;
  if (to >= 0 && to < len) return to;
  return wrap ? (to + len) % len : null;
}

function byKeys(q: Queue, keys: string[]): Track[] {
  const map = new Map(q.keys.map((k, i) => [k, q.tracks[i]]));
  return keys.map((k) => map.get(k)!);
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
