// Frames of dance.json where the cat holds still: facing front at the start and end, the far side of each sway, and the back view between the two spins. Every move runs from one stop to the next, forwards or backwards, so none of them jumps.
export const STOPS: readonly number[] = [0, 40, 50, 79, 90];

// The last stop is the first one again: the file loops from frame 90 to 0.
const LOOP = STOPS.length - 1;
const BACK_CHANCE = 0.3;
const MIRROR_CHANCE = 0.3;

export type Leg = { from: number; to: number; back: boolean };

/** The next move from a stop: usually on to the following one, sometimes the last move played backwards, never two backwards in a row. */
export function nextLeg(
  at: number,
  previous: Leg | undefined,
  rand: () => number,
): Leg {
  const i = Math.max(0, STOPS.indexOf(at)) % LOOP;
  if (previous && !previous.back && rand() < BACK_CHANCE)
    return {
      from: STOPS[i === 0 ? LOOP : i],
      to: STOPS[(i + LOOP - 1) % LOOP],
      back: true,
    };
  return { from: STOPS[i], to: STOPS[i + 1], back: false };
}

/** Whether the cat faces the other way for the next move. Only at the front-facing rest, so it never turns mid-move. */
export function nextMirror(
  at: number,
  mirrored: boolean,
  rand: () => number,
): boolean {
  const front = at === STOPS[0] || at === STOPS[LOOP];
  return front && rand() < MIRROR_CHANCE ? !mirrored : mirrored;
}
