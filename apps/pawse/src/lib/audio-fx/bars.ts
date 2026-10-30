import { LEVEL_BANDS } from "../../../modules/pawse-audio";
import { holdMeter, readLevels } from "./index";

const FLOOR_DB = -70;
const RANGE_DB = 50;
const FALL_PER_SEC = 2.2;
const FRAME_MS = 33;

export const toBar = (db: number): number =>
  Math.min(1, Math.max(0, (db - FLOOR_DB) / RANGE_DB));

export function nextBars(
  prev: number[],
  bandsDb: number[],
  dtSec: number,
): number[] {
  return prev.map((p, i) =>
    Math.max(toBar(bandsDb[i] ?? FLOOR_DB), p - FALL_PER_SEC * dtSec),
  );
}

export function watchBars(onBars: (bars: number[]) => void): () => void {
  const release = holdMeter();
  let bars: number[] = Array(LEVEL_BANDS).fill(0);
  let at = Date.now();
  const id = setInterval(() => {
    const now = Date.now();
    bars = nextBars(bars, readLevels()?.bands ?? [], (now - at) / 1000);
    at = now;
    onBars(bars);
  }, FRAME_MS);
  return () => {
    clearInterval(id);
    release();
  };
}

export const BAR_COUNT = LEVEL_BANDS;
