// JS side of the PawseIsland Android module (cat pill + home-screen widget). A safe no-op on iOS, web and Expo Go.
import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type PillMood = "groove" | "sleep" | "happy" | "curious";
export type PillAction = "toggle" | "next";

export interface PillState {
  /** Long-press hides the pill until this changes. Falls back to title + artist. */
  trackId?: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  mood: PillMood;
  isPlaying: boolean;
  /** "#RRGGBB"; omitted means a colour picked from the artwork. */
  accent?: string | null;
  /** Pill nudge in dp from its cutout position. */
  offsetX?: number;
  offsetY?: number;
}

/** Active media players on the device, Pawse's own included; playing is count > 0. */
export interface OtherAudioEvent {
  playing: boolean;
  count: number;
}

type Events = {
  onAction(event: { action: PillAction }): void;
  onOtherAudio(event: OtherAudioEvent): void;
};

declare class PawseIslandNative extends NativeModule<Events> {
  hasOverlayPermission(): boolean;
  manufacturer(): string;
  requestOverlayPermission(): Promise<boolean>;
  show(state: PillState): Promise<void>;
  update(state: PillState): Promise<void>;
  hide(): Promise<void>;
  openBatterySettings(): Promise<boolean>;
  squareArtwork(urls: string[], px: number): Promise<string | null>;
  startOtherAudioWatch(): void;
  stopOtherAudioWatch(): void;
  otherAudioCount(): number;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<PawseIslandNative>("PawseIsland")
    : null;

/** Makers whose battery managers kill background apps unless Pawse is allowed to autostart. */
const AGGRESSIVE = [
  "xiaomi",
  "redmi",
  "poco",
  "oppo",
  "vivo",
  "iqoo",
  "realme",
];

const clean = (s: PillState): PillState => ({
  ...s,
  artworkUrl: s.artworkUrl ?? null,
  accent: s.accent ?? null,
  offsetX: s.offsetX ?? 0,
  offsetY: s.offsetY ?? 0,
});

export const PawseIsland = {
  /** The native module is linked (an Android dev or release build). */
  available: native != null,

  hasOverlayPermission(): boolean {
    try {
      return native?.hasOverlayPermission() ?? false;
    } catch {
      return false;
    }
  },

  /** Opens "Display over other apps" for Pawse. Check hasOverlayPermission() when the app is active again. */
  requestOverlayPermission(): Promise<boolean> {
    return native
      ? native.requestOverlayPermission().catch(() => false)
      : Promise.resolve(false);
  },

  show(state: PillState): Promise<void> {
    return native
      ? native.show(clean(state)).catch(() => undefined)
      : Promise.resolve();
  },

  /** Updates the pill (when shown) and the home-screen widget. */
  update(state: PillState): Promise<void> {
    return native
      ? native.update(clean(state)).catch(() => undefined)
      : Promise.resolve();
  },

  hide(): Promise<void> {
    return native ? native.hide().catch(() => undefined) : Promise.resolve();
  },

  /** The vendor autostart screen on Xiaomi/Oppo/Vivo/Realme, else the system battery list. */
  openBatterySettings(): Promise<boolean> {
    return native
      ? native.openBatterySettings().catch(() => false)
      : Promise.resolve(false);
  },

  /** Lower-case Build.MANUFACTURER, or "" off Android. */
  manufacturer(): string {
    try {
      return native?.manufacturer() ?? "";
    } catch {
      return "";
    }
  },

  /** True where the one-time battery/autostart tip should show. */
  needsBatteryTip(): boolean {
    const m = PawseIsland.manufacturer();
    return AGGRESSIVE.some((v) => m.includes(v));
  },

  /** Square, bar-free JPEG from the first usable url, as a file URI; null when none loads. */
  squareArtwork(urls: string[], px: number): Promise<string | null> {
    return native
      ? native.squareArtwork(urls, px).catch(() => null)
      : Promise.resolve(null);
  },

  /** Starts onOtherAudio events (Android 8+); a no-op elsewhere. */
  startOtherAudioWatch(): void {
    try {
      native?.startOtherAudioWatch();
    } catch {
      // Older native build without the watcher.
    }
  },

  stopOtherAudioWatch(): void {
    try {
      native?.stopOtherAudioWatch();
    } catch {
      // Older native build without the watcher.
    }
  },

  /** Active media players right now, Pawse's own included; 0 off Android. */
  otherAudioCount(): number {
    try {
      return native?.otherAudioCount() ?? 0;
    } catch {
      return 0;
    }
  },

  /** Fires when the number of active media players changes; returns an unsubscribe. */
  onOtherAudio(cb: (e: OtherAudioEvent) => void): () => void {
    const sub = native?.addListener("onOtherAudio", cb);
    return () => sub?.remove();
  },

  /** Play/pause and next taps from the widget; returns an unsubscribe. */
  onAction(cb: (action: PillAction) => void): () => void {
    const sub = native?.addListener("onAction", (e) => cb(e.action));
    return () => sub?.remove();
  },
};
