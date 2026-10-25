import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { useLibrary } from "./library";
import { kv } from "./storage";

/** Where you stopped in a playlist or album: the song or video, so Resume picks up there. */
export type ListSpot = { id: string; title?: string; at: number };

const KEEP = 200;

const useSpots = create<{ spots: Record<string, ListSpot> }>()(
  persist(() => ({ spots: {} as Record<string, ListSpot> }), {
    name: "pawse.list-spots.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);

export function recordSpot(listId: string, id: string, title?: string) {
  if (useLibrary.getState().settings.incognito) return;
  useSpots.setState((s) => {
    if (s.spots[listId]?.id === id) return s;
    const spots = { ...s.spots, [listId]: { id, title, at: Date.now() } };
    // Only the most recent lists are kept.
    const keys = Object.keys(spots);
    if (keys.length > KEEP)
      for (const k of keys
        .sort((a, b) => spots[a].at - spots[b].at)
        .slice(0, keys.length - KEEP))
        delete spots[k];
    return { spots };
  });
}

export const useListSpot = (listId?: string) =>
  useSpots((s) => (listId ? s.spots[listId] : undefined));

export const forgetSpot = (listId: string) =>
  useSpots.setState((s) => {
    const spots = { ...s.spots };
    delete spots[listId];
    return { spots };
  });
