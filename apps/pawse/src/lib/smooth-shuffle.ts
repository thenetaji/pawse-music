import type { Track } from "@pawse/music-core";

import { distance, type Vector } from "../data/moods";
import { artistKey, trackKey } from "../data/recommend";

export type Drift = { era: number; energy: number; heading: number };

// About a fifth of the range per 20 minutes, on an arc that turns a full circle in 45.
const DRIFT_PER_MIN = 0.02;
const TURN_PER_MIN = (2 * Math.PI) / 45;
const WOBBLE = 0.4;
const PULL = 0.7;
const NOISE = 0.15;
const ARTIST_GAP = 3;
const ARTIST_PENALTY = 0.3;
const UNKNOWN_SEC = 210;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function nextDrift(
  d: Drift,
  minutes: number,
  random: () => number,
): Drift {
  let heading = d.heading + TURN_PER_MIN * minutes + (random() - 0.5) * WOBBLE;
  const step = DRIFT_PER_MIN * minutes;
  let era = d.era + Math.cos(heading) * step;
  let energy = d.energy + Math.sin(heading) * step;
  if (era < 0 || era > 1) heading = Math.PI - heading;
  if (energy < 0 || energy > 1) heading = -heading;
  era = clamp01(era);
  energy = clamp01(energy);
  return { era, energy, heading };
}

type Entry = { track: Track; vector: Vector; key: string; artist: string };

function pickNext(
  pool: Entry[],
  from: Vector,
  drift: Drift,
  recent: string[],
  random: () => number,
): number {
  const target = { ...from, era: drift.era, energy: drift.energy };
  let best = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  pool.forEach((e, i) => {
    const cost =
      distance(e.vector, from) +
      PULL * distance(e.vector, target) +
      (e.artist && recent.includes(e.artist) ? ARTIST_PENALTY : 0) +
      NOISE * random();
    if (cost < bestCost) {
      best = i;
      bestCost = cost;
    }
  });
  return best;
}

export function smoothOrder(
  tracks: Track[],
  o: {
    vectorOf: (t: Track) => Vector;
    start?: Track;
    allowed?: (t: Track) => boolean;
    random?: () => number;
  },
): Track[] {
  const random = o.random ?? Math.random;
  const seen = new Set<string>(o.start ? [trackKey(o.start)] : []);
  const pool: Entry[] = [];
  for (const track of tracks) {
    const key = trackKey(track);
    if (seen.has(key) || (o.allowed && !o.allowed(track))) continue;
    seen.add(key);
    pool.push({
      track,
      key,
      vector: o.vectorOf(track),
      artist: artistKey(track.artists[0]),
    });
  }
  if (!pool.length) return o.start ? [o.start] : [];

  const first: Entry = o.start
    ? {
        track: o.start,
        key: trackKey(o.start),
        vector: o.vectorOf(o.start),
        artist: artistKey(o.start.artists[0]),
      }
    : pool.splice(Math.floor(random() * pool.length), 1)[0];
  const out = [first.track];
  const recent = [first.artist];
  let at = first;
  let drift: Drift = {
    era: first.vector.era,
    energy: first.vector.energy,
    heading: random() * 2 * Math.PI,
  };
  while (pool.length) {
    const next = pool.splice(
      pickNext(pool, at.vector, drift, recent, random),
      1,
    )[0];
    out.push(next.track);
    recent.push(next.artist);
    if (recent.length > ARTIST_GAP) recent.shift();
    drift = nextDrift(
      drift,
      (at.track.durationSec ?? UNKNOWN_SEC) / 60,
      random,
    );
    at = next;
  }
  return out;
}
