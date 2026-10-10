// The listening journal: every play, never trimmed, for stats and the yearly Wrapped.
// Shared by the recorder (journal.ts), backups and the past-plays importers.

/** Where a play came from: played in Pawse, or read from another app's export. */
export type JournalOrigin = "pawse" | "ytm-takeout" | "apple-music";

export type JournalPlay = {
  /** Source track id; "" for imported plays that have none. */
  trackId: string;
  source: "youtube" | "saavn" | "local" | "import";
  title: string;
  /** Artist names, main artist first. */
  artists: string[];
  artistIds?: string[];
  album?: string;
  albumId?: string;
  durationSec?: number;
  /** Small artwork url. */
  art?: string;
  /** ms since epoch when the song started. */
  startedAt: number;
  /** How long it actually played, ms (pauses excluded). */
  listenedMs: number;
  /** finished: reached the end; skipped: moved on before 30 s; stopped: anything else. */
  ended: "finished" | "skipped" | "stopped";
  /** The queue it played from: playlist, album, radio, search, home, library, other. */
  context?: string;
  contextTitle?: string;
  origin: JournalOrigin;
};

export type JournalEvent = {
  at: number;
  kind: "like" | "unlike";
  trackId: string;
};

/** What a backup carries and a restore merges back. */
export type JournalData = { plays: JournalPlay[]; events: JournalEvent[] };

/** Same play seen twice (re-import, restore): same origin, start second and title. */
export const playKey = (p: JournalPlay) =>
  `${p.origin}|${Math.floor(p.startedAt / 1000)}|${p.title.toLowerCase()}`;
