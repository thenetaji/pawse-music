import type {
  AlbumSummary,
  ArtistSummary,
  PlaylistSummary,
  Track,
} from "@pawse/music-core";
import { player, usePlayerStore } from "@pawse/player";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  addedTimes,
  DEFAULT_SETTINGS,
  DISLIKED_MAX,
  dedupeTracks,
  HISTORY_MAX,
  type LibraryData,
  mergeLikes,
  migrateDefaults,
  migrateLocale,
  migrateQuality,
  moveItem,
  type PlaylistSort,
  reinsertTracks,
  type Settings,
  sortTracks,
  strip,
} from "./library-model";
import { readSession, writeSession } from "./session";
import { kv } from "./storage";

export * from "./library-model";

type Library = LibraryData & {
  addSearch(q: string): void;
  clearSearches(): void;
  removeSearch(q: string): void;
  toggleLike(track: Track): boolean;
  isLiked(id: string): boolean;
  /** Thumbs-down; true when the song is now disliked. Calling it again undoes it. */
  toggleDislike(track: Track): boolean;
  isDisliked(id: string): boolean;
  recordPlay(track: Track): void;
  removeFromHistory(at: number): void;
  clearHistory(): void;
  createPlaylist(title: string, tracks?: Track[]): string;
  addToPlaylist(id: string, track: Track): void;
  /** Adds songs not already in the playlist; returns how many went in. */
  addManyToPlaylist(id: string, tracks: Track[]): number;
  /** Drops repeated songs; returns how many went. */
  dedupePlaylist(id: string): number;
  sortPlaylist(id: string, by: PlaylistSort): void;
  removeFromPlaylist(id: string, trackId: string): void;
  removeManyFromPlaylist(id: string, trackIds: string[]): void;
  /** Undoes a removal: puts songs back at their old positions. */
  restoreToPlaylist(id: string, items: { track: Track; at: number }[]): void;
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
  /** Merges a YouTube sync: remote likes in, likes removed on YouTube out, local-only likes kept. A playlists-only refresh leaves syncedAt alone. */
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

type DislikeListener = (track: Track, on: boolean) => void;
const dislikeListeners = new Set<DislikeListener>();

/** Runs after a user dislike/undislike; returns an unsubscribe. */
export function onDislike(cb: DislikeListener): () => void {
  dislikeListeners.add(cb);
  return () => void dislikeListeners.delete(cb);
}

function emit<T extends (track: Track, on: boolean) => void>(
  listeners: Set<T>,
  track: Track,
  on: boolean,
) {
  for (const cb of listeners) {
    try {
      cb(track, on);
    } catch {
      // Side effects never break the toggle itself.
    }
  }
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
      disliked: [],
      settings: { ...DEFAULT_SETTINGS, cookies: readSession() },
      addSearch: (q) => {
        if (get().settings.incognito) return;
        set((s) => ({
          recentSearches: [
            q,
            ...s.recentSearches.filter(
              (x) => x.toLowerCase() !== q.toLowerCase(),
            ),
          ].slice(0, 12),
        }));
      },
      clearSearches: () => set({ recentSearches: [] }),
      removeSearch: (q) =>
        set((s) => ({
          recentSearches: s.recentSearches.filter((x) => x !== q),
        })),
      toggleLike(track) {
        const on = !get().liked.some((t) => t.id === track.id);
        // Liking a disliked song clears the dislike first.
        const wasDisliked = on && get().isDisliked(track.id);
        set((s) => ({
          liked: on
            ? [strip(track), ...s.liked]
            : s.liked.filter((t) => t.id !== track.id),
          ...(wasDisliked
            ? { disliked: s.disliked.filter((t) => t.id !== track.id) }
            : {}),
        }));
        if (wasDisliked) emit(dislikeListeners, track, false);
        emit(likeListeners, track, on);
        return on;
      },
      isLiked: (id) => get().liked.some((t) => t.id === id),
      toggleDislike(track) {
        const on = !get().isDisliked(track.id);
        const wasLiked = on && get().isLiked(track.id);
        set((s) => ({
          disliked: on
            ? [strip(track), ...s.disliked].slice(0, DISLIKED_MAX)
            : s.disliked.filter((t) => t.id !== track.id),
          ...(wasLiked
            ? { liked: s.liked.filter((t) => t.id !== track.id) }
            : {}),
        }));
        if (wasLiked) emit(likeListeners, track, false);
        emit(dislikeListeners, track, on);
        // A thumbs-down on the playing song moves on, like YouTube Music.
        const q = usePlayerStore.getState();
        if (on && q.tracks[q.index]?.id === track.id) player.next();
        return on;
      },
      isDisliked: (id) => (get().disliked ?? []).some((t) => t.id === id),
      recordPlay: (track) => {
        const { pauseHistory, incognito } = get().settings;
        if (pauseHistory || incognito) return;
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
              tracks: dedupeTracks(tracks).map(strip),
              createdAt: now,
              updatedAt: now,
              added: Object.fromEntries(tracks.map((t) => [t.id, now])),
            },
            ...s.playlists,
          ],
        }));
        return id;
      },
      addToPlaylist: (id, track) => void get().addManyToPlaylist(id, [track]),
      addManyToPlaylist(id, tracks) {
        let added = 0;
        const now = Date.now();
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            const have = new Set(p.tracks.map((t) => t.id));
            const fresh = dedupeTracks(tracks).filter((t) => !have.has(t.id));
            added = fresh.length;
            if (!added) return p;
            return {
              ...p,
              tracks: [...p.tracks, ...fresh.map(strip)],
              added: {
                ...addedTimes(p),
                ...Object.fromEntries(fresh.map((t) => [t.id, now])),
              },
              updatedAt: now,
            };
          }),
        }));
        return added;
      },
      dedupePlaylist(id) {
        let removed = 0;
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            const kept = dedupeTracks(p.tracks);
            removed = p.tracks.length - kept.length;
            return removed ? { ...p, tracks: kept, updatedAt: Date.now() } : p;
          }),
        }));
        return removed;
      },
      sortPlaylist(id, by) {
        const plays = new Map<string, number>();
        for (const h of get().history)
          plays.set(h.track.id, (plays.get(h.track.id) ?? 0) + 1);
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            // Remember join times before the list order stops meaning anything.
            const added = addedTimes(p);
            return {
              ...p,
              tracks: sortTracks(p.tracks, by, added, plays),
              added,
              updatedAt: Date.now(),
            };
          }),
        }));
      },
      removeFromPlaylist: (id, trackId) =>
        get().removeManyFromPlaylist(id, [trackId]),
      removeManyFromPlaylist: (id, trackIds) => {
        const gone = new Set(trackIds);
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? {
                  ...p,
                  tracks: p.tracks.filter((t) => !gone.has(t.id)),
                  updatedAt: Date.now(),
                }
              : p,
          ),
        }));
      },
      restoreToPlaylist: (id, items) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? {
                  ...p,
                  tracks: reinsertTracks(p.tracks, items),
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
                // A song disliked here stays out even if YouTube still lists it as liked.
                liked: mergeLikes(s.liked, liked, s.likedRemoteIds).filter(
                  (t) => !s.disliked.some((d) => d.id === t.id),
                ),
                likedRemoteIds: liked.map((t) => t.id),
              }
            : {}),
          ...(playlists ? { ytPlaylists: playlists } : {}),
          ...(liked ? { syncedAt: Date.now() } : {}),
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
        disliked: s.disliked,
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
          settings: migrateDefaults(
            migrateLocale(
              migrateQuality(
                { ...DEFAULT_SETTINGS, ...p.settings, cookies },
                p.settings,
              ),
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
