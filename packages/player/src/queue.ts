import type { Track } from "@pawse/music-core";

// Our queue model: parallel tracks/keys (keys are unique per entry and double as native mediaIds).
export interface Queue {
  tracks: Track[];
  keys: string[];
  index: number;
  /** Unshuffled key order while shuffle is on. */
  original: string[] | null;
  /** First entry of the list being played; entries before it are songs heard earlier. */
  head: string | null;
}

/** Songs kept from earlier queues so Previous can go back to them. */
export const HISTORY_MAX = 50;

let seq = 0;
export const newKey = (): string =>
  `q${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyQueue = (): Queue => ({
  tracks: [],
  keys: [],
  index: 0,
  original: null,
  head: null,
});

export function createQueue(tracks: Track[], startIndex = 0): Queue {
  return {
    tracks: [...tracks],
    keys: tracks.map(newKey),
    index: clamp(startIndex, 0, Math.max(0, tracks.length - 1)),
    original: null,
    head: null,
  };
}

/** Where the list being played starts; repeat all loops back to here, not into the history. */
export const listStart = (q: Queue): number =>
  q.head ? Math.max(0, q.keys.indexOf(q.head)) : 0;

/** Puts the songs heard in `prev` (up to the one playing) in front of a new queue. */
export function withHistory(q: Queue, prev: Queue, max = HISTORY_MAX): Queue {
  if (!q.tracks.length) return q;
  const end = Math.min(prev.index + 1, prev.tracks.length);
  let heard = prev.tracks.slice(Math.max(0, end - max), end);
  // Starting a radio from the song playing would otherwise list it twice in a row.
  if (heard.at(-1)?.id === q.tracks[0]?.id) heard = heard.slice(0, -1);
  const keys = heard.map(newKey);
  return {
    tracks: [...heard, ...q.tracks],
    keys: [...keys, ...q.keys],
    index: heard.length + q.index,
    original: q.original ? [...keys, ...q.original] : null,
    head: q.keys[0] ?? null,
  };
}

/** Forgets the songs before the one playing. */
export function clearHistory(q: Queue): Queue {
  if (!q.index) return q;
  const gone = new Set(q.keys.slice(0, q.index));
  return {
    tracks: q.tracks.slice(q.index),
    keys: q.keys.slice(q.index),
    index: 0,
    original: q.original?.filter((k) => !gone.has(k)) ?? null,
    head: q.head && !gone.has(q.head) ? q.head : null,
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
    // In the unshuffled order, new entries go after the entry that now precedes them; appended ones go last.
    const prev = k[at - 1];
    const pos =
      at >= q.tracks.length
        ? original.length
        : prev
          ? original.indexOf(prev) + 1
          : 0;
    original = [...original];
    original.splice(pos, 0, ...keys);
  }
  return { tracks, keys: k, index, original, head: q.head };
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
    head: q.head === key ? (keys[at] ?? null) : q.head,
  };
}

/** Shuffles the songs after the current one; what was heard stays where it is. Remembers the original order. */
export function shuffle(q: Queue, random: () => number = Math.random): Queue {
  if (!q.tracks.length) return q;
  const rest = q.keys.slice(q.index + 1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const keys = [...q.keys.slice(0, q.index + 1), ...rest];
  return {
    ...q,
    tracks: byKeys(q, keys),
    keys,
    original: q.original ?? [...q.keys],
  };
}

/** Puts the songs still to come back in their original order. */
export function unshuffle(q: Queue): Queue {
  if (!q.original) return q;
  const heard = q.keys.slice(0, q.index + 1);
  const seen = new Set(heard);
  const queued = new Set(q.keys);
  const keys = [
    ...heard,
    ...q.original.filter((k) => !seen.has(k) && queued.has(k)),
  ];
  return { ...q, tracks: byKeys(q, keys), keys, original: null };
}

export const remaining = (q: Queue): number =>
  Math.max(0, q.tracks.length - q.index - 1);

/** Radio refill: drop tracks already queued (by track id) and duplicates within the batch. */
export function freshTracks(q: Queue, incoming: Track[]): Track[] {
  const seen = new Set(q.tracks.map((t) => t.id));
  return incoming.filter((t) => !seen.has(t.id) && (seen.add(t.id), true));
}

/** Index a manual next/previous lands on, or null at the edge. Wrapping forward goes to `start`. */
export function stepIndex(
  len: number,
  index: number,
  dir: 1 | -1,
  wrap: boolean,
  start = 0,
): number | null {
  if (!len) return null;
  const to = index + dir;
  if (to >= 0 && to < len) return to;
  if (!wrap) return null;
  return dir === 1 ? clamp(start, 0, len - 1) : len - 1;
}

function byKeys(q: Queue, keys: string[]): Track[] {
  const map = new Map(q.keys.map((k, i) => [k, q.tracks[i]]));
  return keys.map((k) => map.get(k)!);
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
