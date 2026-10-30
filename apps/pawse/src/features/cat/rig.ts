import { DEFAULT_AMP, DEFAULT_BEAT_MS } from "./beat";
import type { CatMood } from "./cat";

// Poses for the cat's parts, worked out on the UI thread every frame. Units are the cat's 120 x 120 drawing space.

export const STILL = 0;
export const DANCE = 1;
export const SLEEP = 2;
export const WOBBLE = 3;
export const STRETCH = 4;

export interface Pose {
  /** Body offset, rotation (degrees) and squash, all about the feet. */
  y: number;
  rot: number;
  sx: number;
  sy: number;
  earL: number;
  earR: number;
  /** Headphone cup scale; thumps on the beat. */
  cup: number;
  /** Eye height, 1 open to about 0 shut. */
  eye: number;
  /** How high off the ground, 0 to 1; shrinks the shadow. */
  lift: number;
  /** A 0 to 1 pulse that small decorations follow. */
  w: number;
  /** Where the floating notes or Zs are in their drift. */
  nt: number;
}

export const REST: Pose = {
  y: 0,
  rot: 0,
  sx: 1,
  sy: 1,
  earL: 0,
  earR: 0,
  cup: 1,
  eye: 1,
  lift: 0,
  w: 0,
  nt: 0.45,
};

export interface Profile {
  motion: number;
  /** Beat length when the tempo isn't read from the music. */
  beatMs: number;
  live: boolean;
  /** Lowest hop size, 0 to 1. */
  boost: number;
  /** Wobble: half a cycle in ms, sway, lean and bounce. */
  ms: number;
  tilt: number;
  lean: number;
  dy: number;
  /** When the mood began, to blend in from the last pose. */
  at: number;
}

export interface Live {
  beatMs: number;
  amp: number;
  onsetAt: number;
  locked: boolean;
}

export interface RigState {
  phase: number;
  amp: number;
  nt: number;
  onsetSeen: number;
  seenAt: number;
  from: Pose;
  pose: Pose;
}

export const newRig = (pose: Pose = REST): RigState => ({
  phase: 0,
  amp: 0,
  nt: 0,
  onsetSeen: 0,
  seenAt: -1,
  from: pose,
  pose,
});

const WOBBLES: Partial<
  Record<CatMood, Pick<Profile, "ms" | "tilt" | "lean" | "dy">>
> = {
  happy: { ms: 170, tilt: 0, lean: 0, dy: -7 },
  excited: { ms: 170, tilt: 0, lean: 0, dy: -7 },
  curious: { ms: 0, tilt: 0, lean: 9, dy: 0 },
  purr: { ms: 260, tilt: 2, lean: 0, dy: 0 },
  chase: { ms: 120, tilt: 4, lean: 0, dy: -3 },
  vibe: { ms: 900, tilt: 6, lean: 0, dy: 0 },
  love: { ms: 700, tilt: 4, lean: 0, dy: -2 },
  sad: { ms: 1150, tilt: 1, lean: -4, dy: 2 },
};

export function profileFor(
  mood: CatMood,
  beatMs: number,
  live: boolean,
  at: number,
): Profile {
  const base: Profile = {
    motion: STILL,
    beatMs,
    live,
    boost: 0,
    ms: 0,
    tilt: 0,
    lean: 0,
    dy: 0,
    at,
  };
  if (mood === "groove") return { ...base, motion: DANCE };
  if (mood === "hype") return { ...base, motion: DANCE, boost: 0.85 };
  if (mood === "sleep") return { ...base, motion: SLEEP };
  if (mood === "yawn") return { ...base, motion: STRETCH };
  const w = WOBBLES[mood];
  return w ? { ...base, motion: WOBBLE, ...w } : base;
}

const TAU = Math.PI * 2;
const frac = (x: number) => {
  "worklet";
  return x - Math.floor(x);
};
const clamp01 = (x: number) => {
  "worklet";
  return Math.min(1, Math.max(0, x));
};
const mix = (a: number, b: number, k: number) => {
  "worklet";
  return a + (b - a) * k;
};

const NOTE_BEATS = 4;
const NOTE_OFFSETS = [0, 0.325, 0.65];
const Z_MS = 3600;
const BLINK_MS = 4200;
const BREATH_MS = 4600;
const TWITCH_MS = 7000;
const STRETCH_MS = 1400;
const BLEND_MS = 240;
const SNAP = 0.3;
const HOP = 11;

// Eases: 0 smooth, 1 slows into the key, 2 speeds out of it.
const ease = (kind: number, k: number) => {
  "worklet";
  if (kind === 1) return 1 - (1 - k) * (1 - k);
  if (kind === 2) return k * k;
  return k * k * (3 - 2 * k);
};

// Keys are [time 0..1, ease, ...values]; the ease shapes the stretch of time that follows the key.
const track = (keys: readonly number[][], t: number, col: number) => {
  "worklet";
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = clamp01((t - a[0]) / (b[0] - a[0]));
  return mix(a[col], b[col], ease(a[1], k));
};

// Two beats: crouch, hop up stretched and tilted one way, land with a squash, then the other way.
// Columns: y, rotation, squash x, squash y.
const HOPS = [
  [0, 1, 0, -7, 1.05, 0.93],
  [0.1, 0, 1, -5, 1.07, 0.9],
  [0.25, 2, -HOP, 0, 0.95, 1.07],
  [0.44, 0, 0, 6, 1.02, 0.98],
  [0.5, 1, 0, 7, 1.05, 0.93],
  [0.6, 0, 1, 5, 1.07, 0.9],
  [0.75, 2, -HOP, 0, 0.95, 1.07],
  [0.94, 0, 0, -6, 1.02, 0.98],
  [1, 0, 0, -7, 1.05, 0.93],
];
const EAR_L = [
  [0, 0, 6],
  [0.25, 0, -12],
  [0.5, 0, -4],
  [0.75, 0, -12],
  [1, 0, 6],
];
const EAR_R = [
  [0, 0, 4],
  [0.25, 0, 12],
  [0.5, 0, -6],
  [0.75, 0, 12],
  [1, 0, 4],
];
// The ears follow the head by a moment.
const EAR_LAG = 0.075;
const TWITCH = [
  [0, 0, 0],
  [0.8, 0, 0],
  [0.83, 0, 14],
  [0.86, 0, -3],
  [0.89, 0, 9],
  [1, 0, 0],
];

/** `phase` is 0 to 1 over two beats; `amp` 0 (a nod) to 1 (full hops). */
export function dancePose(phase: number, amp: number): Pose {
  "worklet";
  const lift = 0.2 + 0.8 * amp;
  const turn = 0.45 + 0.55 * amp;
  const squash = 0.35 + 0.65 * amp;
  const y = track(HOPS, phase, 2) * lift;
  const ears = frac(phase - EAR_LAG);
  const ear = 0.4 + 0.6 * amp;
  const beat = frac(phase * 2);
  const thump = 1 - ease(1, clamp01(beat / 0.35));
  return {
    y,
    rot: track(HOPS, phase, 3) * turn,
    sx: 1 + (track(HOPS, phase, 4) - 1) * squash,
    sy: 1 + (track(HOPS, phase, 5) - 1) * squash,
    earL: track(EAR_L, ears, 2) * ear,
    earR: track(EAR_R, ears, 2) * ear,
    cup: 1 + 0.14 * (0.45 + 0.55 * amp) * thump,
    eye: 1,
    lift: clamp01(-y / HOP),
    w: beat < 0.5 ? 1 - beat * 2 : 0,
    nt: 0,
  };
}

/** Curled up and breathing slowly; the right ear twitches now and then. */
export function sleepPose(ms: number): Pose {
  "worklet";
  const k = 0.5 - 0.5 * Math.cos(TAU * frac(ms / BREATH_MS));
  return {
    y: 0.5 + 2 * (1 - k),
    rot: -5,
    sx: mix(1.03, 0.99, k),
    sy: mix(0.96, 1.02, k),
    earL: 8,
    earR: 6 + track(TWITCH, frac(ms / TWITCH_MS), 2),
    cup: 1,
    eye: 1,
    lift: 0,
    w: k,
    nt: 0,
  };
}

/** A short stretch as the cat wakes: taller, ears back, then settled. `p` is 0 to 1. */
export function stretchPose(p: number): Pose {
  "worklet";
  const e = Math.sin(Math.PI * clamp01(p));
  return {
    ...REST,
    rot: -4,
    sx: 1 - 0.07 * e,
    sy: 1 + 0.14 * e,
    earL: 10 * e,
    earR: -10 * e,
    w: e,
  };
}

function wobblePose(p: Profile, ms: number): Pose {
  "worklet";
  const c = p.ms > 0 ? Math.cos((Math.PI * ms) / p.ms) : 1;
  const w = 0.5 - 0.5 * c;
  return { ...REST, rot: p.lean - p.tilt * c, y: p.dy * w, w };
}

/** Eye height for the slow blink: shut for a moment every few seconds. */
export function blink(ms: number): number {
  "worklet";
  const p = frac(ms / BLINK_MS);
  if (p < 0.92) return 1;
  if (p < 0.95) return mix(1, 0.08, (p - 0.92) / 0.03);
  return mix(0.08, 1, (p - 0.95) / 0.05);
}

/** Where the cat holds still when motion is turned down. */
export function calmPose(p: Profile): Pose {
  "worklet";
  return p.motion === SLEEP ? sleepPose(BREATH_MS / 2) : REST;
}

function lerpPose(a: Pose, b: Pose, k: number): Pose {
  "worklet";
  return {
    y: mix(a.y, b.y, k),
    rot: mix(a.rot, b.rot, k),
    sx: mix(a.sx, b.sx, k),
    sy: mix(a.sy, b.sy, k),
    earL: mix(a.earL, b.earL, k),
    earR: mix(a.earR, b.earR, k),
    cup: mix(a.cup, b.cup, k),
    eye: mix(a.eye, b.eye, k),
    lift: mix(a.lift, b.lift, k),
    w: mix(a.w, b.w, k),
    nt: b.nt,
  };
}

/** Floating note or Z number `i`: how far along its drift, 0 to 1. */
export function driftAt(nt: number, i: number, sleeping: boolean): number {
  "worklet";
  return frac(nt + (sleeping ? i / 3 : NOTE_OFFSETS[i]));
}

/**
 * Advances the cat by one frame. While dancing, the beat runs at the music's
 * tempo and a kick in the bass nudges it onto the music once the tempo is
 * trusted. A change of mood blends in from the pose the cat was in.
 */
export function stepRig(
  s: RigState,
  p: Profile,
  live: Live,
  dtMs: number,
  now: number,
): RigState {
  "worklet";
  const dt = Math.min(100, Math.max(0, dtMs));
  const beatMs = p.live ? live.beatMs : p.beatMs || DEFAULT_BEAT_MS;
  const goal = Math.max(p.live ? live.amp : DEFAULT_AMP, p.boost);
  const amp =
    s.amp + (goal - s.amp) * (1 - Math.exp(-dt / (goal > s.amp ? 90 : 220)));

  let { phase, onsetSeen, nt } = s;
  let target: Pose;
  if (p.motion === DANCE) {
    phase = frac(phase + dt / (2 * beatMs));
    if (p.live && live.onsetAt !== onsetSeen) {
      onsetSeen = live.onsetAt;
      if (live.locked) {
        const beat = frac(phase * 2);
        phase = frac(phase - ((beat < 0.5 ? beat : beat - 1) * SNAP) / 2);
      }
    }
    nt = frac(nt + dt / (beatMs * NOTE_BEATS));
    target = dancePose(phase, amp);
  } else if (p.motion === SLEEP) {
    nt = frac(nt + dt / Z_MS);
    target = sleepPose(now);
  } else if (p.motion === STRETCH) {
    target = stretchPose((now - p.at) / STRETCH_MS);
  } else if (p.motion === WOBBLE) {
    target = wobblePose(p, now);
  } else {
    target = REST;
  }
  target = { ...target, eye: p.motion === SLEEP ? 1 : blink(now), nt };

  let from = s.from;
  if (p.at !== s.seenAt) from = s.pose;
  const k = clamp01((now - p.at) / BLEND_MS);
  const pose = k >= 1 ? target : lerpPose(from, target, ease(0, k));
  return { phase, amp, nt, onsetSeen, seenAt: p.at, from, pose };
}
