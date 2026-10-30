export type Accel = { x: number; y: number; z: number };

// Force beyond gravity, in g, that counts as one hit; walking stays well under it.
const HIT_G = 1.7;
const HITS = 3;
// Hits closer than this are the same jolt ringing, and the hits must all land inside the window.
const HIT_GAP_MS = 120;
const WINDOW_MS = 1000;
const COOLDOWN_MS = 1800;

/** Feed it accelerometer readings; it answers true once on a firm shake, then stays quiet for a while. */
export function makeShakeDetector() {
  let hits: number[] = [];
  let quietUntil = 0;
  return (a: Accel, now: number): boolean => {
    if (now < quietUntil) return false;
    if (Math.abs(Math.hypot(a.x, a.y, a.z) - 1) < HIT_G) return false;
    const last = hits[hits.length - 1];
    if (last !== undefined && now - last < HIT_GAP_MS) return false;
    hits = hits.filter((t) => now - t < WINDOW_MS);
    hits.push(now);
    if (hits.length < HITS) return false;
    hits = [];
    quietUntil = now + COOLDOWN_MS;
    return true;
  };
}
