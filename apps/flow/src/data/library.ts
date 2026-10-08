import type { Track } from "@studio/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { kv } from "./storage";

export type LocalPlaylist = {
  id: string;
  title: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
};
export type Play = { track: Track; at: number };
export type Settings = {
  preferSaavn: boolean;
  normalize: boolean;
  reportPlays: boolean;
  /** Signed-in Google cookies for music.youtube.com; null when signed out. */
  cookies: string | null;
  accountName: string | null;
};

type Library = {
  liked: Track[];
  playlists: LocalPlaylist[];
  history: Play[];
  settings: Settings;
  recentSearches: string[];
  addSearch(q: string): void;
  clearSearches(): void;
  toggleLike(track: Track): boolean;
  isLiked(id: string): boolean;
  recordPlay(track: Track): void;
  createPlaylist(title: string, tracks?: Track[]): string;
  addToPlaylist(id: string, track: Track): void;
  removeFromPlaylist(id: string, trackId: string): void;
  deletePlaylist(id: string): void;
  setSettings(patch: Partial<Settings>): void;
};

const HISTORY_MAX = 1000;
const strip = (t: Track): Track => ({ ...t, setVideoId: undefined });

export const useLibrary = create<Library>()(
  persist(
    (set, get) => ({
      liked: [],
      playlists: [],
      history: [],
      recentSearches: [],
      addSearch: (q) =>
        set((s) => ({
          recentSearches: [
            q,
            ...s.recentSearches.filter(
              (x) => x.toLowerCase() !== q.toLowerCase(),
            ),
          ].slice(0, 12),
        })),
      clearSearches: () => set({ recentSearches: [] }),
      settings: {
        preferSaavn: false,
        normalize: true,
        reportPlays: true,
        cookies: null,
        accountName: null,
      },
      toggleLike(track) {
        const on = !get().liked.some((t) => t.id === track.id);
        set((s) => ({
          liked: on
            ? [strip(track), ...s.liked]
            : s.liked.filter((t) => t.id !== track.id),
        }));
        return on;
      },
      isLiked: (id) => get().liked.some((t) => t.id === id),
      recordPlay: (track) =>
        set((s) => ({
          history: [
            { track: strip(track), at: Date.now() },
            ...s.history,
          ].slice(0, HISTORY_MAX),
        })),
      createPlaylist(title, tracks = []) {
        const id = `local-${Date.now().toString(36)}`;
        const now = Date.now();
        set((s) => ({
          playlists: [
            {
              id,
              title,
              tracks: tracks.map(strip),
              createdAt: now,
              updatedAt: now,
            },
            ...s.playlists,
          ],
        }));
        return id;
      },
      addToPlaylist: (id, track) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id && !p.tracks.some((t) => t.id === track.id)
              ? {
                  ...p,
                  tracks: [...p.tracks, strip(track)],
                  updatedAt: Date.now(),
                }
              : p,
          ),
        })),
      removeFromPlaylist: (id, trackId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? {
                  ...p,
                  tracks: p.tracks.filter((t) => t.id !== trackId),
                  updatedAt: Date.now(),
                }
              : p,
          ),
        })),
      deletePlaylist: (id) =>
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: "flow.library.v1",
      storage: createJSONStorage(() => kv),
      version: 1,
    },
  ),
);

/** Most played tracks in the last `days`, for the library summary. */
export function topTracks(history: Play[], days: number, n = 20) {
  const since = Date.now() - days * 86400_000;
  const counts = new Map<
    string,
    { track: Track; plays: number; last: number }
  >();
  for (const p of history) {
    if (p.at < since) break;
    const c = counts.get(p.track.id);
    if (c) c.plays++;
    else counts.set(p.track.id, { track: p.track, plays: 1, last: p.at });
  }
  return [...counts.values()]
    .sort((a, b) => b.plays - a.plays || b.last - a.last)
    .slice(0, n);
}
