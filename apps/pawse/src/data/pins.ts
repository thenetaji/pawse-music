import type { Thumbnail, Track } from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { showToast } from "../components/toast";
import { kv } from "./storage";

/** Anything kept at the top of Home: a video, channel, playlist, album, artist or song. */
export type Pin = {
  kind: "video" | "channel" | "playlist" | "album" | "artist" | "song";
  id: string;
  title: string;
  sub?: string;
  thumbnails: Thumbnail[];
  /** Songs keep their track, so they play without a lookup. */
  track?: Track;
};

const MAX_PINS = 40;

export const usePins = create<{ list: Pin[] }>()(
  persist(() => ({ list: [] as Pin[] }), {
    name: "pawse.pins.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);

export const useIsPinned = (id: string) =>
  usePins((s) => s.list.some((p) => p.id === id));

export const isPinned = (id: string) =>
  usePins.getState().list.some((p) => p.id === id);

export function pin(p: Pin) {
  usePins.setState((s) => ({
    list: [p, ...s.list.filter((x) => x.id !== p.id)].slice(0, MAX_PINS),
  }));
  showToast("Pinned to Home");
}

export function unpin(id: string) {
  usePins.setState((s) => ({ list: s.list.filter((x) => x.id !== id) }));
  showToast("Unpinned");
}

/** Pins or unpins, for menus that offer one row for both. */
export const togglePin = (p: Pin) => (isPinned(p.id) ? unpin(p.id) : pin(p));

/** Moves a pin one place left (-1) or right (1). */
export function movePin(id: string, by: -1 | 1) {
  usePins.setState((s) => {
    const i = s.list.findIndex((x) => x.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= s.list.length) return s;
    const list = [...s.list];
    [list[i], list[j]] = [list[j], list[i]];
    return { list };
  });
}
