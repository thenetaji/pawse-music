import type {
  Catalog,
  ResolvedStream,
  StreamResolver,
  Track,
} from "@pawse/music-core";

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
  /** True for a song radio and autoplay should never add (e.g. disliked); explicit queues are untouched. */
  skipTrack?: (track: Track) => boolean;
  /** Seconds the sleep timer fades the volume over before it stops (default 10). */
  sleepFadeSec?: () => number;
  /** Seconds a song fades out at its end (the next fades in over half that); 0 is off. */
  crossfadeSec?: () => number;
  /** Songs from one album (or an album queue) play straight into each other, never crossfaded; default on. */
  gapless?: () => boolean;
  /** A ready artwork URI (e.g. a local square file) for the system Now Playing; undefined uses the best thumbnail. */
  artwork?: (track: Track) => string | undefined;
  /** Pixels to ask for when the cover comes straight from the catalog (default 1200); smaller saves data. */
  artworkPx?: () => number;
  /** Notable playback moments (errors, stalls, interruptions) for an app-side log. */
  onDiagnostic?: (kind: string, detail?: string) => void;
  /** Parts of a song to jump over (SponsorBlock's non-music sections), earliest first. */
  skipSegments?: (
    track: Track,
  ) => Promise<{ start: number; end: number; category: string }[]>;
  /** A segment was just skipped. */
  onSkip?: (track: Track, category: string) => void;
  /** Skips silence at a song's ends: `skip` toggles the audio path's own skipping, else `silentMs` (silence just played) lets the end be cut. */
  trimSilence?: {
    on: () => boolean;
    skip?: (on: boolean) => void;
    silentMs?: () => number | undefined;
  };
  /** Web and desktop: a header-free URL for a stream; a local relay adds its headers. */
  streamUrl?: (stream: ResolvedStream) => string;
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
  /** Add similar songs when the queue runs out; defaults to the radioContinue setting. */
  endless?: boolean;
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
