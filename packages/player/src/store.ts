import type { Track } from "@studio/music-core";
import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { emptyQueue, type Queue } from "./queue";
import type {
  PlayerEventName,
  PlayerStatus,
  QueueSource,
  RepeatMode,
} from "./types";

export interface StoreState extends Queue {
  status: PlayerStatus;
  source?: QueueSource;
  shuffle: boolean;
  repeat: RepeatMode;
  sleepAt?: number | "endOfTrack";
  normalize: boolean;
  error?: string;
  radio: boolean;
}

export const initialState = (): StoreState => ({
  ...emptyQueue(),
  status: "idle",
  shuffle: false,
  repeat: "off",
  normalize: true,
  radio: false,
});

export const usePlayerStore = create<StoreState>()(() => initialState());

export interface PlayerSnapshot {
  status: PlayerStatus;
  current?: Track;
  queue: Track[];
  index: number;
  source?: QueueSource;
  shuffle: boolean;
  repeat: RepeatMode;
  sleepAt?: number | "endOfTrack";
  normalize: boolean;
  error?: string;
}

const snapshot = (s: StoreState): PlayerSnapshot => ({
  status: s.status,
  current: s.tracks[s.index],
  queue: s.tracks,
  index: s.index,
  source: s.source,
  shuffle: s.shuffle,
  repeat: s.repeat,
  sleepAt: s.sleepAt,
  normalize: s.normalize,
  error: s.error,
});

export function usePlayerState(): PlayerSnapshot {
  return usePlayerStore(useShallow(snapshot));
}

/** Re-renders only when the selected value changes (Object.is), e.g. `s => s.current?.id === id`. */
export function usePlayerSelect<T>(selector: (s: PlayerSnapshot) => T): T {
  return usePlayerStore((s) => selector(snapshot(s)));
}

type Listener = (track?: Track) => void;
const listeners = new Map<PlayerEventName, Set<Listener>>();

/** Fires a UI reaction event; 'liked' comes from the app's like button. */
export function emitPlayerEvent(event: PlayerEventName, track?: Track): void {
  listeners.get(event)?.forEach((cb) => cb(track));
}

export function usePlayerEvent(
  event: PlayerEventName,
  cb: (track?: Track) => void,
): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const fn: Listener = (t) => ref.current(t);
    let set = listeners.get(event);
    if (!set) listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => void set.delete(fn);
  }, [event]);
}

/** Non-React listener for the same events; returns an unsubscribe. */
export function onPlayerEvent(
  event: PlayerEventName,
  cb: (track?: Track) => void,
): () => void {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  const fn: Listener = (t) => cb(t);
  set.add(fn);
  return () => void set.delete(fn);
}
