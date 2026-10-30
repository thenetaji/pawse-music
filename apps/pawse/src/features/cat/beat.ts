export const DEFAULT_BEAT_MS = 520;
/** How hard the cat dances when nothing is measuring the song. */
export const DEFAULT_AMP = 0.6;

const MIN_BEAT_MS = 330;
const MAX_BEAT_MS = 750;
const BASS_BANDS = 3;
const ONSET_FLOOR = 0.3;
const ONSET_RISE = 0.16;
const REFRACTORY_MS = 240;
const MAX_GAP_MS = 2000;
const GAPS_KEPT = 10;
const GAPS_TO_LOCK = 4;
const AVG_MS = 400;
const TEMPO_EASE = 0.25;
const MAX_DT_MS = 250;
const ENERGY_UP_MS = 120;
const ENERGY_DOWN_MS = 600;
const QUIET = 0.15;
const LOUD = 0.5;

export interface BeatState {
  at: number;
  /** Short-term average of the bass, what an onset is measured against. */
  avg: number;
  lastOnset: number;
  gaps: number[];
  beatMs: number;
  energy: number;
}

export const newBeat = (at = 0): BeatState => ({
  at,
  avg: 0,
  lastOnset: -1,
  gaps: [],
  beatMs: DEFAULT_BEAT_MS,
  energy: 0,
});

/** Halves or doubles an interval until it reads as a beat, so a kick every other beat still gives the tempo. */
export function foldBeat(ms: number): number {
  let x = ms;
  while (x < MIN_BEAT_MS) x *= 2;
  while (x >= MAX_BEAT_MS) x /= 2;
  return x;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Whether enough kicks were heard to trust the tempo. */
export const beatLocked = (s: BeatState) => s.gaps.length >= GAPS_TO_LOCK;

/**
 * One meter reading (band levels, 0 to 1, lows first). A jump in the bass above
 * its recent average is a kick; the tempo is the median gap between kicks.
 */
export function stepBeat(
  s: BeatState,
  bands: number[],
  now: number,
): { state: BeatState; onset: boolean } {
  const dt = Math.min(MAX_DT_MS, Math.max(1, now - s.at));
  const bass = mean(bands.slice(0, BASS_BANDS));
  const level = mean(bands);
  const onset =
    bass > ONSET_FLOOR &&
    bass - s.avg > ONSET_RISE &&
    now - s.lastOnset > REFRACTORY_MS;

  let { gaps, beatMs, lastOnset } = s;
  if (onset) {
    const gap = now - lastOnset;
    gaps =
      lastOnset >= 0 && gap < MAX_GAP_MS
        ? [...gaps, foldBeat(gap)].slice(-GAPS_KEPT)
        : [];
    lastOnset = now;
    if (gaps.length >= GAPS_TO_LOCK)
      beatMs += (median(gaps) - beatMs) * TEMPO_EASE;
  }

  const rate = level > s.energy ? ENERGY_UP_MS : ENERGY_DOWN_MS;
  return {
    onset,
    state: {
      at: now,
      avg: s.avg + (bass - s.avg) * (1 - Math.exp(-dt / AVG_MS)),
      lastOnset,
      gaps,
      beatMs,
      energy: s.energy + (level - s.energy) * (1 - Math.exp(-dt / rate)),
    },
  };
}

/** 0 for a quiet song (the cat just nods) to 1 for a loud one (full hops). */
export function amplitude(energy: number): number {
  return Math.min(1, Math.max(0, (energy - QUIET) / (LOUD - QUIET)));
}

/** Playback speed for an animation drawn at the default tempo, in steps of a tenth so it isn't re-set for every wobble. */
export function tempoSpeed(beatMs: number): number {
  const speed = Math.min(1.4, Math.max(0.75, DEFAULT_BEAT_MS / beatMs));
  return Math.round(speed * 10) / 10;
}
