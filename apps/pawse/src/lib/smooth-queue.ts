import type { Track } from "@pawse/music-core";
import { type PlayOptions, player, usePlayerStore } from "@pawse/player";
import { create } from "zustand";

import { currentFilters, trackVector } from "../data/mood-library";
import { isAllowed } from "../data/moods";
import { trackKey } from "../data/recommend";
import { getSetting, setSetting, useSetting } from "./settings";
import { smoothOrder } from "./smooth-shuffle";

const SETTING = "smoothShuffle";
const WINDOW = 300;

export const useSmoothShuffle = (): boolean => useSetting(SETTING, false);
export const smoothShuffleOn = (): boolean => getSetting(SETTING, false);

type Order = {
  active: boolean;
  before: string[];
};
const useOrder = create<Order>(() => ({ active: false, before: [] }));

export function useShuffleOn(): boolean {
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smooth = useOrder((o) => o.active);
  return shuffle || smooth;
}

const ordered = (tracks: Track[], start?: Track) => {
  const now = Date.now();
  const filters = currentFilters();
  return smoothOrder(tracks, {
    start,
    vectorOf: (t) => trackVector(t, now),
    allowed: (t) => isAllowed(t, filters),
  });
};

function arrange(keys: string[]) {
  keys.forEach((key, i) => {
    const { keys: queue, index } = usePlayerStore.getState();
    const to = index + 1 + i;
    const from = queue.indexOf(key, to);
    if (from > to) player.move(from, to);
  });
}

const upcoming = () => {
  const s = usePlayerStore.getState();
  return {
    current: s.tracks[s.index],
    tracks: s.tracks.slice(s.index + 1, s.index + 1 + WINDOW),
    keys: s.keys.slice(s.index + 1, s.index + 1 + WINDOW),
  };
};

function smoothUpcoming() {
  const { current, tracks, keys } = upcoming();
  if (!current) return;
  const keyOf = new Map<Track, string>();
  tracks.forEach((t, i) => keyOf.set(t, keys[i]));
  const order = ordered(tracks, current).slice(1);
  arrange(order.flatMap((t) => keyOf.get(t) ?? []));
}

function startSmooth() {
  startSmoothQueue();
  useOrder.setState({
    active: true,
    before: upcoming().tracks.map(trackKey),
  });
  smoothUpcoming();
}

function stopSmooth() {
  const { before } = useOrder.getState();
  const place = new Map(before.map((k, i) => [k, i]));
  const { tracks, keys } = upcoming();
  const rank = (i: number) => place.get(trackKey(tracks[i])) ?? before.length;
  arrange(
    keys
      .map((key, i) => ({ key, i }))
      .sort((a, b) => rank(a.i) - rank(b.i) || a.i - b.i)
      .map((x) => x.key),
  );
  useOrder.setState({ active: false, before: [] });
}

export function toggleShuffle() {
  if (usePlayerStore.getState().shuffle) player.setShuffle(false);
  else if (useOrder.getState().active) stopSmooth();
  else if (smoothShuffleOn()) startSmooth();
  else player.setShuffle(true);
}

export function setSmoothShuffle(on: boolean) {
  if (on === smoothShuffleOn()) return;
  setSetting(SETTING, on);
  if (on && usePlayerStore.getState().shuffle) {
    player.setShuffle(false);
    startSmooth();
  } else if (!on && useOrder.getState().active) {
    stopSmooth();
    player.setShuffle(true);
  }
}

let adopting = false;
export async function playSmooth(tracks: Track[], opts: PlayOptions) {
  const list = ordered(tracks);
  if (!list.length) return;
  startSmoothQueue();
  adopting = true;
  try {
    player.setShuffle(false);
    await player.play(list, 0, opts);
  } finally {
    adopting = false;
  }
  useOrder.setState({ active: true, before: tracks.map(trackKey) });
}

let started = false;
export function startSmoothQueue(): void {
  if (started) return;
  started = true;
  let arranging = false;
  usePlayerStore.subscribe((s, prev) => {
    if (s.keys === prev.keys || adopting || arranging) return;
    if (!useOrder.getState().active) return;
    // A new queue replaces the old one; songs added to it (radio refills) join the order.
    const old = new Set(prev.keys);
    if (!s.keys.some((k) => old.has(k))) {
      useOrder.setState({ active: false, before: [] });
    } else if (s.keys.length > prev.keys.length) {
      arranging = true;
      try {
        smoothUpcoming();
      } finally {
        arranging = false;
      }
    }
  });
}
