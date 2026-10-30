/** The kitten's sprite sheet: 6 columns of 119 x 160 frames, idle first, then run, then the jump. */
export const SHEET = { frameW: 119, frameH: 160, cols: 6, rows: 4 };

const IDLE = [0, 1, 2, 3, 4, 5];
const RUN = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const JUMP = [16, 17, 18, 19, 20, 21];
const IDLE_MS = 170;
export const JUMP_MS = 600;

/**
 * Which frame to show, and how high the kitten is off the ground (0 to 1).
 * The run cycle lasts two beats; a jump started at `jumpAt` plays through once.
 */
export function kittenFrame(
  playing: boolean,
  now: number,
  beatMs: number,
  jumpAt: number,
): { index: number; lift: number } {
  "worklet";
  const t = now - jumpAt;
  if (jumpAt > 0 && t >= 0 && t < JUMP_MS)
    return {
      index: JUMP[Math.floor((t / JUMP_MS) * JUMP.length)],
      lift: Math.sin((Math.PI * t) / JUMP_MS),
    };
  if (playing) {
    const stepMs = Math.min(140, Math.max(60, (2 * beatMs) / RUN.length));
    return { index: RUN[Math.floor(now / stepMs) % RUN.length], lift: 0 };
  }
  return { index: IDLE[Math.floor(now / IDLE_MS) % IDLE.length], lift: 0 };
}
