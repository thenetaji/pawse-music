import { responseDb } from "./biquad";
import type { Chain } from "./eq";

export const CURVE_POINTS = 64;
export const CURVE_MIN_HZ = 20;
export const CURVE_MAX_HZ = 20000;

/** Where a frequency sits along the curve, 0 to 1, on a log scale. */
export const curvePosition = (hz: number): number =>
  Math.log(hz / CURVE_MIN_HZ) / Math.log(CURVE_MAX_HZ / CURVE_MIN_HZ);

/** The chain's gain in dB, preamp included, at log-spaced frequencies from 20 Hz to 20 kHz. */
export function chainCurve(chain: Chain): number[] {
  return Array.from(
    { length: CURVE_POINTS },
    (_, i) =>
      chain.preamp +
      responseDb(
        chain.filters,
        CURVE_MIN_HZ *
          (CURVE_MAX_HZ / CURVE_MIN_HZ) ** (i / (CURVE_POINTS - 1)),
      ),
  );
}
