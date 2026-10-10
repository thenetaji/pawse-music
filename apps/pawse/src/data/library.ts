import type {
  AlbumSummary,
  ArtistSummary,
  PlaylistSummary,
  Track,
} from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_SETTINGS,
  HISTORY_MAX,
  type LibraryData,
  mergeLikes,
  migrateLocale,
  migrateQuality,
  moveItem,
  type Settings,
  strip,
} from "./library-model";
import { readSession, writeSession } from "./session";
import { kv } from "./storage";

export * from "./library-model";

type Library = LibraryData & {
  addSearch(q: string): void;
  clearSearches(): void;
  toggleLike(track: Track): boolean;
  isLiked(id: string): boolean;
  recordPlay(track: Track): void;
  removeFromHistory(at: number): void;
  clearHistory(): void;
  createPlaylist(title: string, tracks?: Track[]): string;
  addToPlaylist(id: string, track: Track): void;
  removeFromPlaylist(id: string, trackId: string): void;
  renamePlaylist(id: string, title: string): void;
  /** Reorders tracks inside a playlist. */
  movePlaylistTrack(id: string, from: number, to: number): void;
  /** Reorders the playlists list. */
  movePlaylist(from: number, to: number): void;
  duplicatePlaylist(id: string): string | undefined;
  deletePlaylist(id: string): void;
  toggleSaveAlbum(album: AlbumSummary): boolean;
  isAlbumSaved(id: string): boolean;
  toggleFollowArtist(artist: ArtistSummary): boolean;
  isFollowing(id: string): boolean;
  setSettings(patch: Partial<Settings>): void;
  /** Merges a YouTube sync: remote likes in, likes removed on YouTube out, local-only likes kept. */
  applyRemote(remote: { liked?: Track[]; playlists?: PlaylistSummary[] }): void;
};

const newId = () =>
  `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type LikeListener = (track: Track, on: boolean) => void;
const likeListeners = new Set<LikeListener>();

/** Runs after a user like/unlike (not after a sync); returns an unsubscribe. */
export function onLike(cb: LikeListener): () => void {
  likeListeners.add(cb);
  return () => void likeListeners.delete(cb);
}

let legacyCookies = false;

export const useLibrary = create<Library>()(
  persist(
    (set, get) => ({
      liked: [],
      playlists: [],
      history: [],
      recentSearches: [],
      savedAlbums: [],
      followedArtists: [],
      ytPlaylists: [],
      likedRemoteIds: [],
      syncedAt: 0,
      settings: { ...DEFAULT_SETTINGS, cookies: readSession() },
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
      toggleLike(track) {
        const on = !get().liked.some((t) => t.id === track.id);
        set((s) => ({
          liked: on
            ? [strip(track), ...s.liked]
            : s.liked.filter((t) => t.id !== track.id),
        }));
        for (const cb of likeListeners) {
          try {
            cb(track, on);
          } catch {
            // Side effects never break the like itself.
          }
        }
        return on;
      },
      isLiked: (id) => get().liked.some((t) => t.id === id),
      recordPlay: (track) => {
        if (get().settings.pauseHistory) return;
        set((s) => ({
          history: [
            { track: strip(track), at: Date.now() },
            ...s.history,
          ].slice(0, HISTORY_MAX),
        }));
      },
      removeFromHistory: (at) =>
        set((s) => ({ history: s.history.filter((p) => p.at !== at) })),
      clearHistory: () => set({ history: [] }),
      createPlaylist(title, tracks = []) {
        const id = newId();
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
      renamePlaylist: (id, title) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id && title.trim()
              ? { ...p, title: title.trim(), updatedAt: Date.now() }
              : p,
          ),
        })),
      movePlaylistTrack: (id, from, to) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? {
                  ...p,
                  tracks: moveItem(p.tracks, from, to),
                  updatedAt: Date.now(),
                }
              : p,
          ),
        })),
      movePlaylist: (from, to) =>
        set((s) => ({ playlists: moveItem(s.playlists, from, to) })),
      duplicatePlaylist(id) {
        const src = get().playlists.find((p) => p.id === id);
        if (!src) return undefined;
        return get().createPlaylist(`${src.title} copy`, src.tracks);
      },
      deletePlaylist: (id) =>
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      toggleSaveAlbum(album) {
        const on = !get().savedAlbums.some((a) => a.id === album.id);
        const summary: AlbumSummary = {
          id: album.id,
          title: album.title,
          artists: album.artists,
          year: album.year,
          kind: album.kind,
          thumbnails: album.thumbnails,
        };
        set((s) => ({
          savedAlbums: on
            ? [summary, ...s.savedAlbums]
            : s.savedAlbums.filter((a) => a.id !== album.id),
        }));
        return on;
      },
      isAlbumSaved: (id) => get().savedAlbums.some((a) => a.id === id),
      toggleFollowArtist(artist) {
        const on = !get().followedArtists.some((a) => a.id === artist.id);
        const summary: ArtistSummary = {
          id: artist.id,
          name: artist.name,
          subtitle: artist.subtitle,
          thumbnails: artist.thumbnails,
        };
        set((s) => ({
          followedArtists: on
            ? [summary, ...s.followedArtists]
            : s.followedArtists.filter((a) => a.id !== artist.id),
        }));
        return on;
      },
      isFollowing: (id) => get().followedArtists.some((a) => a.id === id),
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      applyRemote: ({ liked, playlists }) =>
        set((s) => ({
          ...(liked
            ? {
                liked: mergeLikes(s.liked, liked, s.likedRemoteIds),
                likedRemoteIds: liked.map((t) => t.id),
              }
            : {}),
          ...(playlists ? { ytPlaylists: playlists } : {}),
          syncedAt: Date.now(),
        })),
    }),
    {
      name: "pawse.library.v1",
      storage: createJSONStorage(() => kv),
      version: 2,
      partialize: (s): LibraryData => ({
        liked: s.liked,
        playlists: s.playlists,
        history: s.history,
        settings: { ...s.settings, cookies: null },
        recentSearches: s.recentSearches,
        savedAlbums: s.savedAlbums,
        followedArtists: s.followedArtists,
        ytPlaylists: s.ytPlaylists,
        likedRemoteIds: s.likedRemoteIds,
        syncedAt: s.syncedAt,
      }),
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<LibraryData>;
        // v1 users already use the app, so they skip onboarding.
        if (version < 2)
          return {
            ...s,
            settings: { ...DEFAULT_SETTINGS, ...s.settings, onboarded: true },
          } as LibraryData;
        return s as LibraryData;
      },
      // New settings fields get their defaults without a version bump; the session comes from the keychain.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LibraryData>;
        const legacy = p.settings?.cookies ?? null;
        const cookies = current.settings.cookies ?? legacy;
        if (legacy) {
          if (!current.settings.cookies) writeSession(legacy);
          legacyCookies = true;
        }
        return {
          ...current,
          ...p,
          settings: migrateLocale(
            migrateQuality(
              { ...DEFAULT_SETTINGS, ...p.settings, cookies },
              p.settings,
            ),
            p.settings,
          ),
        };
      },
    },
  ),
);

// Older builds kept the session in the plain store: rewrite it once without cookies.
if (legacyCookies) useLibrary.setState({});

let savedCookies = useLibrary.getState().settings.cookies;
useLibrary.subscribe((s) => {
  if (s.settings.cookies === savedCookies) return;
  savedCookies = s.settings.cookies;
  writeSession(savedCookies);
});

// Signed-in and network actions live in account.ts (it imports the clients, which import this store).
export const syncYouTubeLibrary = async () =>
  (await import("./account")).syncYouTubeLibrary();
export const importPlaylist = async (urlOrId: string) =>
  (await import("./account")).importPlaylist(urlOrId);
export const dailyMixes = async () => (await import("./account")).dailyMixes();
export const maybeSyncLibrary = async () =>
  (await import("./account")).maybeSyncLibrary();
export const importFromYouTubeAccount = async (
  onProgress?: (label: string) => void,
) => (await import("./account")).importFromYouTubeAccount(onProgress);
