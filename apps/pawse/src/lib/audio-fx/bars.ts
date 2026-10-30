import { LEVEL_BANDS } from "../../../modules/pawse-audio";
import { holdMeter, readLevels } from "./index";

const FLOOR_DB = -70;
const RANGE_DB = 50;
const FRAME_MS = 33;
const ATTACK_MS = 60;
const DECAY_MS = 250;
const BASS_LIFT = 0.18;

export const BAR_COUNT = 32;
const HALF = BAR_COUNT / 2;

export const toBar = (db: number): number =>
  Math.min(1, Math.max(0, (db - FLOOR_DB) / RANGE_DB));

export const silentBands = (): number[] => Array(LEVEL_BANDS).fill(0);

/** One step of `level` towards `target`: quick to rise, slow to fall. */
export function easeLevels(
  level: number[],
  target: number[],
  dtMs: number,
): number[] {
  "worklet";
  const up = 1 - Math.exp(-dtMs / ATTACK_MS);
  const down = 1 - Math.exp(-dtMs / DECAY_MS);
  return level.map((p, i) => {
    const t = target[i] ?? 0;
    return p + (t - p) * (t > p ? up : down);
  });
}

/** BAR_COUNT bars from the bands: lows in the middle, highs at both edges, the bass lifted a little. */
export function mirrorBars(bands: number[]): number[] {
  "worklet";
  const last = bands.length - 1;
  const out: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const f = (i < HALF ? HALF - 1 - i : i - HALF) / (HALF - 1);
    const pos = f * last;
    const lo = Math.floor(pos);
    const a = bands[lo] ?? 0;
    const b = bands[Math.min(lo + 1, last)] ?? 0;
    out.push(
      Math.min(1, (a + (b - a) * (pos - lo)) * (1 + BASS_LIFT * (1 - f))),
    );
  }
  return out;
}

/** Calls `onBands` about 30 times a second with each band's level, 0 to 1. */
export function watchBars(onBands: (bands: number[]) => void): () => void {
  const release = holdMeter();
  const id = setInterval(
    () => onBands((readLevels()?.bands ?? []).map(toBar)),
    FRAME_MS,
  );
  return () => {
    clearInterval(id);
    release();
  };
}
