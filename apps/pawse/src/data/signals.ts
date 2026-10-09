import type { Track } from "@pawse/music-core";
import { getProgress, onPlayerEvent, usePlayerStore } from "@pawse/player";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { onLike, useLibrary } from "./library";
import { kv } from "./storage";

// Per-track listening signals for recommendations: counts only, track metadata stays in the library.
export type TrackSignal = {
  plays: number;
  completes: number;
  /** Moved on before 30 s. */
  skips: number;
  lastPlayed: number;
  likedAt?: number;
  /** Only for pruning: skips must not refresh a track's recency. */
  lastSkipped?: number;
};
export type SignalMap = Record<string, TrackSignal>;

export const SIGNALS_MAX = 2000;
const SKIP_SEC = 30;
const COMPLETE_SHARE = 0.85;

const EMPTY: TrackSignal = { plays: 0, completes: 0, skips: 0, lastPlayed: 0 };

/** Keeps the most recently touched tracks once past `max`, trimming to 90% so pruning is rare. */
export function pruneSignals(map: SignalMap, max = SIGNALS_MAX): SignalMap {
  const ids = Object.keys(map);
  if (ids.length <= max) return map;
  const touched = (s: TrackSignal) =>
    Math.max(s.lastPlayed, s.likedAt ?? 0, s.lastSkipped ?? 0);
  const keep = ids
    .sort((a, b) => touched(map[b]) - touched(map[a]))
    .slice(0, Math.floor(max * 0.9));
  return Object.fromEntries(keep.map((id) => [id, map[id]]));
}

type SignalsState = {
  tracks: SignalMap;
  bump(id: string, patch: (s: TrackSignal) => Partial<TrackSignal>): void;
  clear(): void;
};

export const useSignals = create<SignalsState>()(
  persist(
    (set) => ({
      tracks: {},
      bump: (id, patch) =>
        set((st) => {
          const cur = st.tracks[id] ?? EMPTY;
          const next = { ...st.tracks, [id]: { ...cur, ...patch(cur) } };
          return {
            tracks: id in st.tracks ? next : pruneSignals(next),
          };
        }),
      clear: () => set({ tracks: {} }),
    }),
    {
      name: "flow.signals.v1",
      storage: createJSONStorage(() => kv),
      version: 1,
      partialize: (s) => ({ tracks: s.tracks }),
    },
  ),
);

export const trackSignals = (id: string): TrackSignal =>
  useSignals.getState().tracks[id] ?? EMPTY;

const paused = () => useLibrary.getState().settings.pauseHistory;

// The current track's listening session; play time only counts while the player is playing.
type Session = {
  track: Track;
  playedMs: number;
  since: number | null;
  closed: boolean;
  /** History recorded it (past 30 s, or half of a short song). */
  played: boolean;
};
let session: Session | undefined;

const listenedSec = (s: Session, now = Date.now()) =>
  (s.playedMs + (s.since ? now - s.since : 0)) / 1000;

function complete(track: Track) {
  if (paused()) return;
  useSignals.getState().bump(track.id, (s) => ({
    completes: s.completes + 1,
    lastPlayed: Date.now(),
  }));
}

let started = false;
/** Listens to player and library events; safe to call more than once. */
export function startSignals(): void {
  if (started) return;
  started = true;

  usePlayerStore.subscribe((st, prev) => {
    if (!session || st.status === prev.status) return;
    if (st.status === "playing") session.since ??= Date.now();
    else if (session.since) {
      session.playedMs += Date.now() - session.since;
      session.since = null;
    }
  });

  onPlayerEvent("skipped", (track) => {
    if (!track || paused()) return;
    const pos = getProgress().position;
    const dur = track.durationSec ?? 0;
    const own = session?.track.id === track.id ? session : undefined;
    if (own) own.closed = true;
    // A short song can count as played before 30 s; that listen is not a skip.
    if (pos < SKIP_SEC && !own?.played)
      useSignals.getState().bump(track.id, (s) => ({
        skips: s.skips + 1,
        lastSkipped: Date.now(),
      }));
    else if (dur > 0 && pos >= dur * COMPLETE_SHARE) complete(track);
  });

  onPlayerEvent("trackChanged", (track) => {
    // A song left without a skip ran out on its own (or the user jumped away near its end).
    const prev = session;
    if (prev && !prev.closed) {
      const dur = prev.track.durationSec ?? 0;
      if (dur > 0 && listenedSec(prev) >= dur * COMPLETE_SHARE)
        complete(prev.track);
    }
    session = track && {
      track,
      playedMs: 0,
      since: usePlayerStore.getState().status === "playing" ? Date.now() : null,
      closed: false,
      played: false,
    };
  });

  // History only records plays past 30 s, so a new history head is a play; clearing history clears these too.
  let lastAt = useLibrary.getState().history[0]?.at ?? 0;
  useLibrary.subscribe((st, prev) => {
    if (!st.history.length && prev.history.length)
      useSignals.getState().clear();
    const head = st.history[0];
    if (!head || head.at <= lastAt) return;
    lastAt = head.at;
    if (session?.track.id === head.track.id) session.played = true;
    useSignals.getState().bump(head.track.id, (s) => ({
      plays: s.plays + 1,
      lastPlayed: head.at,
    }));
  });

  onLike((track, on) => {
    useSignals
      .getState()
      .bump(track.id, () => ({ likedAt: on ? Date.now() : undefined }));
  });
}

startSignals();
