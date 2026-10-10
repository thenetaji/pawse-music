// Square, bar-free art for the system Now Playing and the islands. YouTube video stills are 16:9 or letterboxed 4:3.
import { bestThumbnail, type Track } from "@pawse/music-core";
import { refreshArtwork, usePlayerStore } from "@pawse/player";
import { Platform } from "react-native";

import { PawseActivity } from "../../modules/pawse-activity";
import { PawseIsland } from "../../modules/pawse-island-android";
import { findSongArt } from "./song-art";

export const NOW_PLAYING_PX = 600;
/** Under the native file cap (80) so a remembered file is still on disk. */
const KEEP = 40;
/** The current song and the next one. */
const WINDOW = 2;
const YTIMG = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;

const ready = new Map<string, string>(); // track id -> file URI, oldest first
const pending = new Map<string, Promise<string | null>>();
const listeners = new Set<(trackId: string) => void>();

/** Bigger stills without letterbox bars first, the original last (YouTube's missing ones are 120 px placeholders). */
export function artworkSources(url: string): string[] {
  const id = YTIMG.exec(url)?.[1];
  if (!id) return [url];
  const base = `https://i.ytimg.com/vi/${id}/`;
  return [...new Set([`${base}maxresdefault.jpg`, `${base}hq720.jpg`, url])];
}

/** A square JPEG file URI from the best source for `url`; null on web, in Expo Go or when nothing loads. */
export function squareArtwork(url: string, px: number): Promise<string | null> {
  const urls = artworkSources(url);
  if (Platform.OS === "ios") return PawseActivity.squareArtwork(urls, px);
  if (Platform.OS === "android") return PawseIsland.squareArtwork(urls, px);
  return Promise.resolve(null);
}

/** The prepared square art for a track, if it is ready. */
export function readyArtwork(track: Track): string | undefined {
  return ready.get(track.id);
}

/** Crops a YouTube video still to a square file once per track; other art is square already and resolves null. */
export function prepareArtwork(track: Track): Promise<string | null> {
  const have = ready.get(track.id);
  if (have) return Promise.resolve(have);
  const url = bestThumbnail(track.thumbnails);
  if (!url || !YTIMG.test(url)) return Promise.resolve(null);
  let p = pending.get(track.id);
  if (!p) {
    // The matching song's square cover beats any crop of the video still.
    p = findSongArt(track)
      .then((song) =>
        song?.length
          ? (bestThumbnail(song, NOW_PLAYING_PX) ?? null)
          : squareArtwork(url, NOW_PLAYING_PX),
      )
      .then((file) => {
        if (file) remember(track.id, file);
        return file;
      })
      .finally(() => pending.delete(track.id));
    pending.set(track.id, p);
  }
  return p;
}

function remember(id: string, file: string): void {
  ready.delete(id);
  ready.set(id, file);
  for (const old of ready.keys()) {
    if (ready.size <= KEEP) break;
    ready.delete(old);
  }
  for (const cb of listeners) cb(id);
}

/** Called with the track id whenever its square art becomes ready; returns an unsubscribe. */
export function onArtworkReady(cb: (trackId: string) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

let started = false;
/** Keeps the current and next song's art prepared and swaps it into the player's Now Playing when done. */
export function startArtwork(): void {
  if (started) return;
  started = true;
  const prepareWindow = () => {
    const { tracks, index } = usePlayerStore.getState();
    for (const t of tracks.slice(index, index + WINDOW)) void prepareArtwork(t);
  };
  usePlayerStore.subscribe((s, prev) => {
    if (s.index !== prev.index || s.tracks !== prev.tracks) prepareWindow();
  });
  onArtworkReady(refreshArtwork);
  prepareWindow();
}
