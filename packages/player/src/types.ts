import type { Catalog, StreamResolver, Track } from "@pawse/music-core";

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface SetupOptions {
  resolver: StreamResolver;
  catalog?: Pick<Catalog, "upNext">;
  storage?: KeyValueStore;
  onPlayed?: (track: Track, playedSec: number) => void;
  /** Pause when headphones disconnect; read once at setup (native option). */
  pauseOnDisconnect?: boolean;
  /** When true, any queue keeps going with radio from its last track once it runs low. */
  radioContinue?: () => boolean;
  /** Seconds the sleep timer fades the volume over before it stops (default 10). */
  sleepFadeSec?: () => number;
  /** A ready artwork URI (e.g. a local square file) for the system Now Playing; undefined uses the best thumbnail. */
  artwork?: (track: Track) => string | undefined;
  /** Notable playback moments (errors, stalls, interruptions) for an app-side log. */
  onDiagnostic?: (kind: string, detail?: string) => void;
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

/** "finished": the current song played past 80% (fires once per play). */
export type PlayerEventName =
  | "trackChanged"
  | "liked"
  | "skipped"
  | "paused"
  | "seeked"
  | "finished";

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
