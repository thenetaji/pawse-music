// The listening journal on web and desktop: one JSON blob in localStorage, fine at desktop volumes.
import {
  type JournalData,
  type JournalEvent,
  type JournalPlay,
  playKey,
} from "./journal-types";

const KEY = "pawse.journal.v1";
const ls = () =>
  typeof localStorage === "undefined" ? undefined : localStorage;

let cache: JournalData | undefined;

function load(): JournalData {
  if (cache) return cache;
  try {
    const d = JSON.parse(ls()?.getItem(KEY) ?? "null");
    cache = {
      plays: Array.isArray(d?.plays) ? d.plays : [],
      events: Array.isArray(d?.events) ? d.events : [],
    };
  } catch {
    cache = { plays: [], events: [] };
  }
  return cache;
}

const save = () => ls()?.setItem(KEY, JSON.stringify(load()));
const eventKey = (e: JournalEvent) => `${e.at}|${e.kind}|${e.trackId}`;

/** Saves a play; the same play (same key) is overwritten, so a checkpoint can be updated. */
export async function recordPlay(p: JournalPlay): Promise<void> {
  const d = load();
  const k = playKey(p);
  const i = d.plays.findIndex((x) => playKey(x) === k);
  if (i >= 0) d.plays[i] = p;
  else d.plays.push(p);
  save();
}

export async function recordEvent(e: JournalEvent): Promise<void> {
  const d = load();
  if (!d.events.some((x) => eventKey(x) === eventKey(e))) d.events.push(e);
  save();
}

/** Inserts plays not already in the journal (by key); returns how many were new. */
export async function addPlays(plays: JournalPlay[]): Promise<number> {
  const d = load();
  const have = new Set(d.plays.map(playKey));
  let added = 0;
  for (const p of plays) {
    const k = playKey(p);
    if (have.has(k)) continue;
    have.add(k);
    d.plays.push(p);
    added++;
  }
  if (added) save();
  return added;
}

/** Plays oldest first, optionally within [since, until). */
export async function allPlays(
  since = 0,
  until = Number.MAX_SAFE_INTEGER,
): Promise<JournalPlay[]> {
  return load()
    .plays.filter((p) => p.startedAt >= since && p.startedAt < until)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export async function exportJournal(): Promise<JournalData> {
  return { plays: await allPlays(), events: [...load().events] };
}

/** Merges a journal in (dedupes plays by key, events by value); returns how many plays were new. */
export async function importJournal(j: JournalData): Promise<number> {
  const added = await addPlays(j.plays);
  const d = load();
  const have = new Set(d.events.map(eventKey));
  const fresh = j.events.filter((e) => !have.has(eventKey(e)));
  if (fresh.length) {
    d.events.push(...fresh);
    save();
  }
  return added;
}

export async function journalCount(): Promise<number> {
  return load().plays.length;
}

export async function clearJournal(): Promise<void> {
  cache = { plays: [], events: [] };
  save();
}
