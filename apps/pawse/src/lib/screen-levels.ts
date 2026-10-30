import { Platform } from "react-native";

export type LevelKind = "brightness" | "volume";

// Loaded when full screen opens, so a build without these native modules still runs, just without the swipes.
const brightnessModule = () => import("expo-brightness").catch(() => undefined);
const volumeModule = () =>
  import("react-native-volume-manager").catch(() => undefined);

// Where each level is now (0 to 1); a kind that couldn't be read isn't here, and its swipe does nothing.
const now: Partial<Record<LevelKind, number>> = {};
let original: number | undefined;
let moved = false;
let sentAt = 0;
// Native calls are spaced out; the last one always goes through when the finger lets go.
const SEND_MS = 40;

/** Reads the screen's brightness and the volume as full screen opens; brightness is put back on the way out. */
export async function startLevels() {
  if (Platform.OS === "web") return;
  moved = false;
  const [b, v] = await Promise.all([
    brightnessModule()
      .then((m) => m?.getBrightnessAsync())
      .catch(() => undefined),
    volumeModule()
      .then((m) => m?.getVolume())
      .catch(() => undefined),
  ]);
  original = b;
  if (b !== undefined) now.brightness = b;
  else delete now.brightness;
  if (v !== undefined) now.volume = v.volume;
  else delete now.volume;
}

export const levelNow = (kind: LevelKind) => now[kind];

/** Reads the volume afresh, since the buttons may have moved it since; undefined where it can't be read. */
export async function readVolume() {
  if (Platform.OS === "web") return undefined;
  const v = await volumeModule()
    .then((m) => m?.getVolume())
    .catch(() => undefined);
  if (v === undefined) delete now.volume;
  else now.volume = v.volume;
  return now.volume;
}

const send = (kind: LevelKind, value: number) => {
  if (kind === "brightness")
    void brightnessModule()
      .then((m) => m?.setBrightnessAsync(value))
      .catch(() => {});
  else
    void volumeModule()
      .then((m) => m?.setVolume(value, { showUI: false }))
      .catch(() => {});
};

export function setLevel(kind: LevelKind, value: number) {
  now[kind] = value;
  if (kind === "brightness") moved = true;
  if (Date.now() - sentAt < SEND_MS) return;
  sentAt = Date.now();
  send(kind, value);
}

/** The finger lets go: the last value is sent for sure. */
export const settleLevel = (kind: LevelKind) => {
  const value = now[kind];
  if (value !== undefined) send(kind, value);
};

/** Leaving full screen gives the screen its own brightness back; the volume stays where you put it. */
export async function stopLevels() {
  if (!moved) return;
  moved = false;
  const m = await brightnessModule();
  // iOS has one brightness for the whole phone; Android's belongs to this window and is simply let go of.
  if (Platform.OS === "ios" && original !== undefined)
    await m?.setBrightnessAsync(original).catch(() => {});
  else await m?.restoreSystemBrightnessAsync().catch(() => {});
}
