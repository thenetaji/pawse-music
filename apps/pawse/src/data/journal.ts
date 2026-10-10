// The listening journal on phones: every play in SQLite, never trimmed. Web uses journal.web.ts.
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import {
  type JournalData,
  type JournalEvent,
  type JournalPlay,
  playKey,
} from "./journal-types";

let db: SQLiteDatabase | undefined;

function open(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync("pawse-journal.db");
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS plays (
      key TEXT NOT NULL, trackId TEXT NOT NULL, source TEXT NOT NULL,
      title TEXT NOT NULL, artists TEXT NOT NULL, artistIds TEXT,
      album TEXT, albumId TEXT, durationSec REAL, art TEXT,
      startedAt INTEGER NOT NULL, listenedMs INTEGER NOT NULL, ended TEXT NOT NULL,
      context TEXT, contextTitle TEXT, origin TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS plays_key ON plays(key);
    CREATE INDEX IF NOT EXISTS plays_started ON plays(startedAt);
    CREATE TABLE IF NOT EXISTS events (
      at INTEGER NOT NULL, kind TEXT NOT NULL, trackId TEXT NOT NULL,
      UNIQUE(at, kind, trackId)
    );
  `);
  return db;
}

const COLS =
  "key, trackId, source, title, artists, artistIds, album, albumId, durationSec, art, startedAt, listenedMs, ended, context, contextTitle, origin";
const SLOTS = COLS.split(",")
  .map(() => "?")
  .join(", ");

const params = (p: JournalPlay) => [
  playKey(p),
  p.trackId,
  p.source,
  p.title,
  JSON.stringify(p.artists),
  p.artistIds ? JSON.stringify(p.artistIds) : null,
  p.album ?? null,
  p.albumId ?? null,
  p.durationSec ?? null,
  p.art ?? null,
  p.startedAt,
  Math.round(p.listenedMs),
  p.ended,
  p.context ?? null,
  p.contextTitle ?? null,
  p.origin,
];

type Row = Record<string, string | number | null>;

const json = (v: unknown): string[] | undefined => {
  try {
    const a = typeof v === "string" ? JSON.parse(v) : undefined;
    return Array.isArray(a) ? a.map(String) : undefined;
  } catch {
    return undefined;
  }
};

function fromRow(r: Row): JournalPlay {
  const opt = <K extends keyof JournalPlay>(k: K) =>
    r[k] === null || r[k] === undefined ? {} : { [k]: r[k] };
  const artistIds = json(r.artistIds);
  return {
    trackId: String(r.trackId),
    source: r.source as JournalPlay["source"],
    title: String(r.title),
    artists: json(r.artists) ?? [],
    ...(artistIds ? { artistIds } : {}),
    ...opt("album"),
    ...opt("albumId"),
    ...opt("durationSec"),
    ...opt("art"),
    startedAt: Number(r.startedAt),
    listenedMs: Number(r.listenedMs),
    ended: r.ended as JournalPlay["ended"],
    ...opt("context"),
    ...opt("contextTitle"),
    origin: r.origin as JournalPlay["origin"],
  };
}

/** Saves a play; the same play (same key) is overwritten, so a checkpoint can be updated. */
export async function recordPlay(p: JournalPlay): Promise<void> {
  await open().runAsync(
    `INSERT OR REPLACE INTO plays (${COLS}) VALUES (${SLOTS})`,
    params(p),
  );
}

export async function recordEvent(e: JournalEvent): Promise<void> {
  await open().runAsync(
    "INSERT OR IGNORE INTO events (at, kind, trackId) VALUES (?, ?, ?)",
    [e.at, e.kind, e.trackId],
  );
}

/** Inserts plays not already in the journal (by key) in one transaction; returns how many were new. */
export async function addPlays(plays: JournalPlay[]): Promise<number> {
  if (!plays.length) return 0;
  const d = open();
  let added = 0;
  await d.withExclusiveTransactionAsync(async (txn) => {
    const st = await txn.prepareAsync(
      `INSERT OR IGNORE INTO plays (${COLS}) VALUES (${SLOTS})`,
    );
    try {
      for (const p of plays)
        added += (await st.executeAsync(params(p))).changes;
    } finally {
      await st.finalizeAsync();
    }
  });
  return added;
}

async function addEvents(events: JournalEvent[]): Promise<void> {
  if (!events.length) return;
  await open().withExclusiveTransactionAsync(async (txn) => {
    const st = await txn.prepareAsync(
      "INSERT OR IGNORE INTO events (at, kind, trackId) VALUES (?, ?, ?)",
    );
    try {
      for (const e of events) await st.executeAsync([e.at, e.kind, e.trackId]);
    } finally {
      await st.finalizeAsync();
    }
  });
}

/** Plays oldest first, optionally within [since, until). */
export async function allPlays(
  since = 0,
  until = Number.MAX_SAFE_INTEGER,
): Promise<JournalPlay[]> {
  const rows = await open().getAllAsync<Row>(
    `SELECT ${COLS} FROM plays WHERE startedAt >= ? AND startedAt < ? ORDER BY startedAt`,
    [since, until],
  );
  return rows.map(fromRow);
}

export async function exportJournal(): Promise<JournalData> {
  const events = await open().getAllAsync<JournalEvent>(
    "SELECT at, kind, trackId FROM events ORDER BY at",
  );
  return { plays: await allPlays(), events };
}

/** Merges a journal in (dedupes plays by key, events by value); returns how many plays were new. */
export async function importJournal(d: JournalData): Promise<number> {
  const added = await addPlays(d.plays);
  await addEvents(d.events);
  return added;
}

export async function journalCount(): Promise<number> {
  const r = await open().getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM plays",
  );
  return r?.n ?? 0;
}

export async function clearJournal(): Promise<void> {
  await open().execAsync("DELETE FROM plays; DELETE FROM events;");
}
