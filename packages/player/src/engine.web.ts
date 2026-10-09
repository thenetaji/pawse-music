// Web stand-in for the screenshot harness: same API, in-memory queue and a progress clock, no audio.
import type { Track } from "@pawse/music-core";
import { useEffect, useState } from "react";

import * as Q from "./queue";
import { emitPlayerEvent, type StoreState, usePlayerStore } from "./store";
import type { Player, Progress, SetupOptions } from "./types";

const get = usePlayerStore.getState;
const set = (patch: Partial<StoreState>) => usePlayerStore.setState(patch);

let basePos = 0;
let startedAt: number | null = null;
let ender: ReturnType<typeof setTimeout> | undefined;

export function normalizeVolume(loudnessDb?: number): number {
  return loudnessDb && loudnessDb > 0
    ? Q.clamp(10 ** (-loudnessDb / 20), 0, 1)
    : 1;
}

const durationOf = () => get().tracks[get().index]?.durationSec ?? 0;
const position = () =>
  Math.min(
    durationOf() || Infinity,
    basePos + (startedAt ? (Date.now() - startedAt) / 1000 : 0),
  );

export const getProgress = (): Progress => ({
  position: position(),
  duration: durationOf(),
  buffered: durationOf(),
});

function run(on: boolean): void {
  basePos = position();
  startedAt = on ? Date.now() : null;
  clearTimeout(ender);
  const left = durationOf() - basePos;
  if (on && left > 0)
    ender = setTimeout(() => {
      emitPlayerEvent("finished", get().tracks[get().index]);
      advance(1, true);
    }, left * 1000);
  set({ status: on ? "playing" : get().tracks.length ? "paused" : "idle" });
}

function goTo(i: number): void {
  const s = get();
  if (i < 0 || i >= s.tracks.length) return run(false);
  set({ index: i });
  basePos = 0;
  emitPlayerEvent("trackChanged", s.tracks[i]);
  run(true);
}

function advance(dir: 1 | -1, auto = false): void {
  const s = get();
  if (auto && s.repeat === "one") return goTo(s.index);
  const n = Q.stepIndex(s.tracks.length, s.index, dir, s.repeat === "all");
  if (n === null) return auto ? run(false) : undefined;
  goTo(n);
}

function load(
  tracks: Track[],
  startIndex: number,
  extra: Partial<StoreState>,
): void {
  let q = Q.createQueue(tracks, startIndex);
  if (get().shuffle) q = Q.shuffle(q);
  set({ ...q, ...extra, error: undefined });
  goTo(q.index);
}

export function setPrefetchAhead(_n?: number): void {}

export function refreshArtwork(_trackId: string): void {}

export function setupPlayer(_opts: SetupOptions): Promise<void> {
  return Promise.resolve();
}

export const player: Player = {
  async play(tracks, startIndex = 0, o = {}) {
    load(tracks, startIndex, { source: o.source, radio: !!o.radio });
  },
  async playRadio(seed) {
    set({
      source: {
        type: "radio",
        id: seed.playlistId ?? seed.videoId,
        title: seed.title,
      },
      radio: true,
    });
  },
  toggle: () => run(get().status !== "playing"),
  pause() {
    run(false);
    emitPlayerEvent("paused", get().tracks[get().index]);
  },
  resume: () => run(true),
  next() {
    emitPlayerEvent("skipped", get().tracks[get().index]);
    advance(1);
  },
  previous() {
    if (position() > 3) return player.seekTo(0);
    advance(-1);
  },
  seekTo(sec) {
    basePos = sec;
    run(startedAt !== null);
  },
  addNext: (track) => set(Q.insertNext(get(), track)),
  addToQueue: (track) => set(Q.append(get(), [track])),
  move: (from, to) => set(Q.move(get(), from, to)),
  remove: (index) => set(Q.remove(get(), index)),
  skipTo: (index) => goTo(index),
  setShuffle(on) {
    if (on !== get().shuffle)
      set({ ...(on ? Q.shuffle(get()) : Q.unshuffle(get())), shuffle: on });
  },
  setRepeat: (repeat) => set({ repeat }),
  setSleepTimer: (v) =>
    set({
      sleepAt:
        v === null
          ? undefined
          : v === "endOfTrack"
            ? v
            : Date.now() + v * 60_000,
    }),
  setNormalize: (normalize) => set({ normalize }),
};

export function useProgress(): Progress {
  const [p, setP] = useState<Progress>(() => ({
    position: position(),
    duration: durationOf(),
    buffered: durationOf(),
  }));
  useEffect(() => {
    const id = setInterval(
      () =>
        setP({
          position: position(),
          duration: durationOf(),
          buffered: durationOf(),
        }),
      500,
    );
    return () => clearInterval(id);
  }, []);
  return p;
}
