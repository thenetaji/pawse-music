import { LEVEL_BANDS, type Levels } from "../../../modules/pawse-audio";
import { holdMeter, readLevels } from "./index";

const FRAME_MS = 33;
const MAX_DT_MS = 250;
const ATTACK_MS = 60;
const DECAY_MS = 250;

// Mastered music sits near full scale in every band, so each band is scaled to its own recent range.
const SILENCE_DB = -90;
const PEAK_FALL_DB_PER_S = 4;
const FLOOR_RISE_MS = 6000;
const MIN_SPAN_DB = 18;
const MAX_SPAN_DB = 45;
const CURVE = 1.4;
const BODY = 0.8;
const AVERAGE_MS = 220;
const ONSET_DB = 10;
const ONSET_KICK = 0.3;

const DEAD_DB = -100;
const DEAD_GRACE_MS = 1000;

export const BAR_COUNT = 22;
const LEAN = 0.8;
const GAIN_SPREAD = 0.08;
const WOBBLE = 0.15;
const TAU = Math.PI * 2;

const SYNTH_BASE = 0.3;
const SYNTH_SWAY = 0.18;
const SYNTH_FLUTTER = 0.1;
const SYNTH_TILT = 0.4;

export const silentBands = (): number[] => Array(LEVEL_BANDS).fill(0);

/** What one band has done lately, in dB. */
export interface BandRange {
  peak: number;
  floor: number;
  /** Short-term average, the baseline an onset is measured against. */
  avg: number;
}

type Ranges = (BandRange | undefined)[];

/**
 * Scales each band's dB into 0 to 1 against its own recent peak (falls over a
 * few seconds) and floor (rises slowly), and kicks a band that jumps above its
 * short-term average so drums land in different bars.
 */
export function trackBands(
  ranges: Ranges,
  db: number[],
  dtMs: number,
): { ranges: Ranges; levels: number[] } {
  const dt = Math.min(MAX_DT_MS, Math.max(1, dtMs));
  const heard = db.filter((x) => x > SILENCE_DB);
  const mean = heard.reduce((sum, x) => sum + x, 0) / Math.max(1, heard.length);
  const next: Ranges = [];
  const levels: number[] = [];
  for (let i = 0; i < db.length; i++) {
    const x = db[i];
    const before = ranges[i];
    if (x <= SILENCE_DB) {
      next.push(before);
      levels.push(0);
      continue;
    }
    // A first look starts every band at the same distance from the song's average, so the spectrum's own tilt shows.
    const r = before ?? { peak: mean + 6, floor: mean - 30, avg: x };
    const peak = Math.max(x, r.peak - (PEAK_FALL_DB_PER_S * dt) / 1000);
    const floor = Math.min(
      x,
      r.floor + (x - r.floor) * (1 - Math.exp(-dt / FLOOR_RISE_MS)),
    );
    const span = Math.min(MAX_SPAN_DB, Math.max(MIN_SPAN_DB, peak - floor));
    const body = Math.min(1, Math.max(0, (x - (peak - span)) / span)) ** CURVE;
    const kick = Math.min(1, Math.max(0, x - r.avg) / ONSET_DB) * ONSET_KICK;
    next.push({
      peak,
      floor,
      avg: r.avg + (x - r.avg) * (1 - Math.exp(-dt / AVERAGE_MS)),
    });
    levels.push(Math.min(1, body * BODY + kick));
  }
  return { ranges: next, levels };
}

/** A meter that reports its floor without ever hearing silence is not attached to this song. */
export const meterDead = (levels: Levels): boolean =>
  levels.silentMs === 0 && levels.bands.every((db) => db <= DEAD_DB);

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

/** A stable pseudo-random number in [0, 1) for a bar and a purpose. */
export function unit(i: number, salt: number): number {
  "worklet";
  const s = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * BAR_COUNT bars from the bands, lows on the left. A bar between two bands
 * leans towards one of them and carries a small fixed gain and a slow wobble of
 * its own, so neighbours differ while still following the music.
 */
export function barLevels(bands: number[], timeMs: number): number[] {
  "worklet";
  const last = bands.length - 1;
  const out: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    if (last < 1) {
      out.push(0);
      continue;
    }
    const pos = (i / (BAR_COUNT - 1)) * last;
    const lo = Math.min(Math.floor(pos), last - 1);
    const lean = Math.min(1, Math.max(0, pos - lo + (unit(i, 1) - 0.5) * LEAN));
    const base = bands[lo] + (bands[lo + 1] - bands[lo]) * lean;
    const gain = 1 + (unit(i, 2) * 2 - 1) * GAIN_SPREAD;
    const wobble =
      1 +
      WOBBLE *
        Math.sin((timeMs / 1000) * (0.5 + unit(i, 3) * 0.9) + unit(i, 4) * TAU);
    out.push(Math.min(1, base * gain * wobble));
  }
  return out;
}

/** Band levels for a song the meter can't hear: a gentle drift, a little stronger in the bass. */
export function synthBands(timeMs: number, count: number): number[] {
  "worklet";
  const t = timeMs / 1000;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const sway = Math.sin(t * (1.4 + unit(i, 5) * 2.6) + unit(i, 6) * TAU);
    const flutter = Math.sin(t * (4 + unit(i, 7) * 3.5) + unit(i, 8) * TAU);
    const tilt = 1 - SYNTH_TILT * (i / (count - 1));
    out.push(
      Math.max(0, SYNTH_BASE + SYNTH_SWAY * sway + SYNTH_FLUTTER * flutter) *
        tilt,
    );
  }
  return out;
}

/**
 * Calls `onBands` about 30 times a second with each band's level, 0 to 1. It
 * passes null once the meter has heard nothing for a second, which means it
 * isn't measuring this song.
 */
export function watchBars(
  onBands: (bands: number[] | null) => void,
): () => void {
  const release = holdMeter();
  let ranges: Ranges = [];
  let last = Date.now();
  let deadSince: number | null = null;
  const id = setInterval(() => {
    const now = Date.now();
    const dt = now - last;
    last = now;
    const levels = readLevels();
    if (!levels || meterDead(levels)) {
      deadSince ??= now;
      onBands(now - deadSince > DEAD_GRACE_MS ? null : silentBands());
      return;
    }
    deadSince = null;
    const tracked = trackBands(ranges, levels.bands, dt);
    ranges = tracked.ranges;
    onBands(tracked.levels);
  }, FRAME_MS);
  return () => {
    clearInterval(id);
    release();
  };
}
