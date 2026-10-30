/** What the player has of the song being loaded, in seconds as the native player reports them. */
export interface Sample {
  position: number;
  duration: number;
  buffered: number;
  cached: number;
}

/** What a tiny ranged request to a stream's URL said. */
export type Probe = "ok" | "refused" | "unreachable";

export const WATCH_MS = 1000;
/** A silent source is asked about, and the next one prepared, from here on: a refusing server answers within a second. */
export const PREPARE_AFTER_MS = 1500;
export const RACE_AFTER_MS = 3000;
/** Nothing arrived at all: the URL is dead or its client is blocked. */
export const NO_BYTES_MS = 5500;
/** Bytes came, then stopped. */
export const IDLE_MS = 8000;
/** Total time one song gets to start before it is given up on. */
export const BUDGET_MS = 20_000;
/** Total time a song that was already playing gets to resume. */
export const MID_SONG_BUDGET_MS = 45_000;
/** A slower failover than this leaves too little of the budget for the next source, so JioSaavn goes next. */
export const SAAVN_RESERVE_MS = 5000;
// AVPlayer reads a long file's whole index before it starts, so a long song gets 1 s more per minute to begin.
const START_PER_MIN_MS = 1000;
const START_MAX_MS = 60_000;

export interface Watch {
  /** Time spent buffering this song, counted only while the app is in the foreground. */
  songMs: number;
  /** Since the current source was handed to the player. */
  sourceMs: number;
  /** Since the current source last delivered anything. */
  idleMs: number;
  /** The current source delivered something. */
  gotData: boolean;
  /** The song had been playing; this is a rebuffer. */
  midSong: boolean;
  /** How long a source may stay silent before it counts as dead. */
  noBytesMs: number;
  /** The server can be asked about a URL, so a slow network can be told from a refusing one. */
  canProbe: boolean;
  probe?: Probe;
  /** What the next candidate's probe said, once it is resolved and asked. */
  rivalProbe?: Probe;
}

export type Verdict =
  | { kind: "wait" }
  | { kind: "weak" }
  | { kind: "failover"; why: "refused" | "no-bytes" | "idle" }
  | { kind: "giveup" };

export const budgetOf = (midSong: boolean) =>
  midSong ? MID_SONG_BUDGET_MS : BUDGET_MS;

/** How long a source that has delivered nothing may stay silent; a long song reading its index gets longer. */
export function noBytesAfter(direct: boolean, durationSec = 0): number {
  if (!direct) return NO_BYTES_MS;
  return Math.min(
    START_MAX_MS,
    NO_BYTES_MS + (durationSec / 60) * START_PER_MIN_MS,
  );
}

const moved = (a: number, b: number) => Math.abs(a - b) > 0.05;

/** Whether the player took in anything since the last sample. */
export function progressed(prev: Sample, cur: Sample): boolean {
  return (
    cur.position > prev.position + 0.05 ||
    moved(cur.buffered, prev.buffered) ||
    moved(cur.cached, prev.cached) ||
    (prev.duration <= 0 && cur.duration > 0)
  );
}

/**
 * Whether bytes of the song reached the player. A song read through the cache proxy knows its length as soon as its
 * first bytes are parsed; a playlist (or a direct file) knows it before any audio, so only buffered audio counts.
 */
export function hasData(s: Sample, viaPlaylist: boolean): boolean {
  return (
    s.buffered > 0 ||
    s.cached > 0 ||
    s.position > 0 ||
    (!viaPlaylist && s.duration > 0)
  );
}

/**
 * What to do about a song that is still buffering. Nothing arriving is a dead source and fails over fast; bytes
 * trickling in is a slow network, which another client would only restart from zero, so it keeps waiting until the
 * song's budget is spent.
 */
export function judge(w: Watch): Verdict {
  if (w.songMs >= budgetOf(w.midSong)) return { kind: "giveup" };
  if (w.probe === "refused") return { kind: "failover", why: "refused" };
  if (!w.gotData) {
    // The next client answers while this one doesn't: no need to wait out the rest.
    if (
      w.sourceMs >= RACE_AFTER_MS &&
      w.probe !== "ok" &&
      w.rivalProbe === "ok"
    )
      return { kind: "failover", why: "no-bytes" };
    // The phone can't reach the server at all: another client reaches it no better.
    if (w.probe === "unreachable") return { kind: "weak" };
    if (w.sourceMs >= w.noBytesMs) return { kind: "failover", why: "no-bytes" };
    return { kind: "wait" };
  }
  if (w.probe !== "unreachable") {
    if (!w.canProbe && w.idleMs >= IDLE_MS)
      return { kind: "failover", why: "idle" };
    if (w.idleMs >= IDLE_MS * 2) return { kind: "failover", why: "idle" };
  }
  return w.idleMs >= IDLE_MS || w.sourceMs >= RACE_AFTER_MS + 1000
    ? { kind: "weak" }
    : { kind: "wait" };
}

/** Whether to ask about the current source now: silent or idle for a while, and not asked about this stretch yet. */
export function shouldProbe(w: Watch): boolean {
  if (!w.canProbe || w.probe) return false;
  return w.gotData ? w.idleMs >= IDLE_MS / 2 : w.sourceMs >= PREPARE_AFTER_MS;
}

/** After this much of the budget, the next source is JioSaavn: another silent YouTube client would not fit. */
export function saavnNext(songMs: number, midSong: boolean): boolean {
  return songMs + NO_BYTES_MS > budgetOf(midSong) - SAAVN_RESERVE_MS;
}

/** Download speed in kbit/s from how much audio the player took in over `dtMs`; undefined when nothing was gained. */
export function kbpsOf(
  prev: Sample,
  cur: Sample,
  dtMs: number,
  bitrate: number,
): number | undefined {
  const gained = Math.max(
    cur.cached - prev.cached,
    cur.buffered - prev.buffered,
  );
  if (gained <= 0.05 || dtMs <= 0 || bitrate <= 0) return undefined;
  return Math.round(((gained / (dtMs / 1000)) * bitrate) / 1000);
}
