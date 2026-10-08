import type { Catalog, StreamResolver, Track } from "@studio/music-core";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface SetupOptions {
  resolver: StreamResolver;
  catalog?: Pick<Catalog, "upNext">;
  storage?: KeyValueStore;
  onPlayed?: (track: Track, playedSec: number) => void;
}

export type RepeatMode = "off" | "all" | "one";

export type QueueSource = {
  type:
    | "album"
    | "playlist"
    | "artist"
    | "radio"
    | "search"
    | "library"
    | "other";
  id?: string;
  title?: string;
};

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "error";

export type PlayerEventName = "trackChanged" | "liked" | "skipped" | "paused";

export interface PlayOptions {
  source?: QueueSource;
  /** Keep refilling from catalog.upNext. */
  radio?: boolean;
}

export interface RadioSeed {
  videoId?: string;
  playlistId?: string;
  title?: string;
}

export interface Player {
  play(tracks: Track[], startIndex?: number, opts?: PlayOptions): Promise<void>;
  playRadio(seed: RadioSeed): Promise<void>;
  toggle(): void;
  pause(): void;
  resume(): void;
  next(): void;
  previous(): void;
  seekTo(sec: number): void;
  addNext(track: Track): void;
  addToQueue(track: Track): void;
  move(from: number, to: number): void;
  remove(index: number): void;
  skipTo(index: number): void;
  setShuffle(on: boolean): void;
  setRepeat(mode: RepeatMode): void;
  /** Minutes, 'endOfTrack', or null to cancel. */
  setSleepTimer(value: number | "endOfTrack" | null): void;
  setNormalize(on: boolean): void;
}

export interface Progress {
  position: number;
  duration: number;
  buffered: number;
}
