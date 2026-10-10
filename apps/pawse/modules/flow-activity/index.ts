// JS side of the FlowActivity Expo module. Every call is a safe no-op when the native module isn't linked.
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
  /** ms since epoch after which iOS treats the activity as out of date (Flow may have been closed). */
  staleAt: number;
}

type Events = { onAction(event: { action: ActivityAction }): void };

declare class FlowActivityNative extends NativeModule<Events> {
  isSupported(): boolean;
  start(state: ActivityState): Promise<boolean>;
  update(state: ActivityState): Promise<boolean | undefined>;
  end(): Promise<void>;
  setArtwork(url: string): Promise<string | null>;
  squareArtwork(urls: string[], px: number): Promise<string | null>;
}

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<FlowActivityNative>("FlowActivity")
    : null;

export const FlowActivity = {
  /** The native module is linked (an iOS dev or release build, not Expo Go or web). */
  available: native != null,

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

  /** Play/pause and next taps from the island; returns an unsubscribe. */
  onAction(cb: (action: ActivityAction) => void): () => void {
    const sub = native?.addListener("onAction", (e) => cb(e.action));
    return () => sub?.remove();
  },
};
