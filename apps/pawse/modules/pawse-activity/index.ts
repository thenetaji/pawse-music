// JS side of the PawseActivity Expo module. Every call is a safe no-op when the native module isn't linked.
import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type ActivityMood =
  | "groove"
  | "sleep"
  | "happy"
  | "curious"
  | "hype"
  | "vibe"
  | "love"
  | "sad";
export type ActivityAction = "toggle" | "next" | "previous";
export type ActivityCatColor = "orange" | "black" | "white" | "grey";
/** What the compact island shows beside the artwork: the cat, sound bars, or the time left. */
export type IslandStyle = "cat" | "time";

export interface ActivityState {
  title: string;
  artist: string;
  /** File name in the App Group, from setArtwork(). */
  artwork: string | null;
  isPlaying: boolean;
  mood: ActivityMood;
  frame: number;
  /** Track timeline in ms since epoch; drives the self-moving progress bar. */
  start: number;
  end: number;
  /** 0...1, shown while paused. */
  progress: number;
  /** Picks the cat-<color>-* frames. */
  color: ActivityCatColor;
  /** Mouse cameo frame: 0 none, 1 peeking, 2 head out. */
  mouse: 0 | 1 | 2;
  /** The cat's name for VoiceOver; null uses "The cat". */
  name: string | null;
  /** "#RRGGBB" from the artwork, for the ring, bar and lock screen; null keeps the purple. */
  tint: string | null;
  /** ms since epoch after which iOS treats the activity as out of date (Pawse may have been closed). */
  staleAt: number;
  style: IslandStyle;
}

type Events = { onAction(event: { action: ActivityAction }): void };

declare class PawseActivityNative extends NativeModule<Events> {
  isSupported(): boolean;
  start(state: ActivityState): Promise<boolean>;
  update(state: ActivityState): Promise<boolean | undefined>;
  end(): Promise<void>;
  setArtwork(url: string): Promise<string | null>;
  squareArtwork(urls: string[], px: number): Promise<string | null>;
  setResumeAfterInterruption(on: boolean): void;
  saveBackupFolder(uri: string): boolean;
  clearBackupFolder(): void;
  writeBackupFile(name: string, text: string): Promise<boolean>;
  listBackupFiles(): Promise<string[]>;
  readBackupFileHead(name: string, bytes: number): Promise<string | null>;
  deleteBackupFile(name: string): Promise<boolean>;
}

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<PawseActivityNative>("PawseActivity")
    : null;

// Older native builds lack newer functions, so a sync throw counts as failure too.
function call<T>(
  run: (n: PawseActivityNative) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!native) return Promise.resolve(fallback);
  try {
    return run(native).catch(() => fallback);
  } catch {
    return Promise.resolve(fallback);
  }
}

export const PawseActivity = {
  /** The native module is linked (an iOS dev or release build, not Expo Go or web). */
  available: native != null,

  /** The native build can bookmark and write the auto-backup folder. */
  backupFolder: typeof native?.saveBackupFolder === "function",

  isSupported(): boolean {
    try {
      return native?.isSupported() ?? false;
    } catch {
      return false;
    }
  },

  start(state: ActivityState): Promise<boolean> {
    return native
      ? native.start(state).catch(() => false)
      : Promise.resolve(false);
  },

  /** False when no activity was left to update (iOS ended it, or it was swiped away). */
  update(state: ActivityState): Promise<boolean> {
    return native
      ? native
          .update(state)
          .then((alive) => alive !== false)
          .catch(() => true)
      : Promise.resolve(false);
  },

  end(): Promise<void> {
    return native ? native.end().catch(() => undefined) : Promise.resolve();
  },

  setArtwork(url: string): Promise<string | null> {
    return native
      ? native.setArtwork(url).catch(() => null)
      : Promise.resolve(null);
  },

  /** Square, bar-free JPEG from the first usable url, as a file URI; null when none loads. */
  squareArtwork(urls: string[], px: number): Promise<string | null> {
    return native
      ? native.squareArtwork(urls, px).catch(() => null)
      : Promise.resolve(null);
  },

  /** Lets the player resume by itself once a call, video or other app's audio ends. */
  setResumeAfterInterruption(on: boolean): void {
    try {
      native?.setResumeAfterInterruption(on);
    } catch {
      // Older native build without the function.
    }
  },

  /** Bookmarks the just-picked backup folder so it survives relaunches; false when it can't. */
  saveBackupFolder(uri: string): boolean {
    try {
      return native?.saveBackupFolder(uri) ?? false;
    } catch {
      return false;
    }
  },

  clearBackupFolder(): void {
    try {
      native?.clearBackupFolder();
    } catch {
      // Older native build without the function.
    }
  },

  /** Coordinated atomic write of a UTF-8 file into the bookmarked folder. */
  writeBackupFile(name: string, text: string): Promise<boolean> {
    return call((n) => n.writeBackupFile(name, text), false);
  },

  /** File names in the bookmarked folder; empty when it can't be reached. */
  listBackupFiles(): Promise<string[]> {
    return call((n) => n.listBackupFiles(), [] as string[]);
  },

  readBackupFileHead(name: string, bytes: number): Promise<string | null> {
    return call((n) => n.readBackupFileHead(name, bytes), null);
  },

  deleteBackupFile(name: string): Promise<boolean> {
    return call((n) => n.deleteBackupFile(name), false);
  },

  /** Play/pause and next taps from the island; returns an unsubscribe. */
  onAction(cb: (action: ActivityAction) => void): () => void {
    const sub = native?.addListener("onAction", (e) => cb(e.action));
    return () => sub?.remove();
  },
};
