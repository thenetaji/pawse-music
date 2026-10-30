// How far the cat leans and how high it hops, at its quietest.
const MIN_GAIN = 0.35;

/** Moves the beat count on by one frame. Counted in beats over a pair, so the lean swings one way and back. */
export function advanceBeat(
  count: number,
  dtMs: number,
  beatMs: number,
): number {
  "worklet";
  return (count + dtMs / beatMs) % 2;
}

/** Pulls the beat count towards the nearest whole beat when a kick lands, so the hops settle on the kicks without a jump. */
export function snapToBeat(count: number, pull: number): number {
  "worklet";
  const off = count - Math.round(count);
  return (count - off * pull + 2) % 2;
}

/** A hop on every beat (lift, 0 to 1) and a lean every other beat (tilt, -1 to 1); both grow with the song's loudness. */
export function sway(
  count: number,
  amp: number,
): { lift: number; tilt: number } {
  "worklet";
  const gain = MIN_GAIN + (1 - MIN_GAIN) * amp;
  const beat = count % 1;
  return {
    lift: 4 * beat * (1 - beat) * gain,
    tilt: Math.sin(Math.PI * count) * gain,
  };
}
