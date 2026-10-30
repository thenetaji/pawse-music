export type SkipSwipe = "sideways" | "reels";
/** Which third of the cover a tap lands in: back, the middle, or forward. */
export type Zone = -1 | 0 | 1;

/** Seconds a double tap on a side moves the song. */
export const SEEK_SEC = 10;
/** A second tap this soon after the first, in the same third, is a double tap. */
export const DOUBLE_MS = 280;
/** Once a double tap has landed, each further tap in that third within this long counts again. */
export const CHAIN_MS = 1000;
/** Press and hold this long before a slide changes the volume. */
export const HOLD_MS = 300;
/** A slide of this share of the cover's height goes from silent to full. */
export const VOLUME_SPAN = 0.6;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function tapZone(x: number, width: number): Zone {
  if (width <= 0) return 0;
  const at = x / width;
  return at < 1 / 3 ? -1 : at > 2 / 3 ? 1 : 0;
}

/** The volume after the finger has moved `dy` px down from where it began; up is louder. */
export const volumeAt = (from: number, dy: number, travel: number) =>
  travel > 0 ? clamp01(from - dy / travel) : from;

export const seekTarget = (from: number, zone: -1 | 1, duration: number) =>
  Math.min(
    duration > 0 ? duration : Number.POSITIVE_INFINITY,
    Math.max(0, from + zone * SEEK_SEC),
  );

export type TapChain = { at: number; zone: Zone; chained: boolean };
export type TapKind = "single" | "double" | "again";

/** Classifies a tap by the one before it; a single waits for `DOUBLE_MS` to see if a second comes. */
export function registerTap(
  prev: TapChain | undefined,
  zone: Zone,
  now: number,
): { kind: TapKind; chain: TapChain } {
  const gap =
    prev && prev.zone === zone ? now - prev.at : Number.POSITIVE_INFINITY;
  if (prev?.chained && gap < CHAIN_MS)
    return { kind: "again", chain: { at: now, zone, chained: true } };
  if (gap < DOUBLE_MS)
    return { kind: "double", chain: { at: now, zone, chained: true } };
  return { kind: "single", chain: { at: now, zone, chained: false } };
}

const CLOSE_DISTANCE = 80;
const CLOSE_FLICK_V = 700;
const CLOSE_FLICK_DISTANCE = 24;

/** A pull down on the header closes the player when it goes far, or is a quick flick. */
export const pullCloses = (dy: number, velocityY: number) =>
  dy > CLOSE_DISTANCE ||
  (dy > CLOSE_FLICK_DISTANCE && velocityY > CLOSE_FLICK_V);
