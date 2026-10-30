import { useEffect } from "react";
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { curvePosition } from "../../lib/audio-fx/curve";

export const CURVE_HEIGHT = 140;
/** dB from the middle line to the top or bottom edge. */
const SPAN = 15;
const PAD = 6;
const GRID_HZ = [100, 1000, 10000];

/** The curve glides from what it showed to the new one, on the UI thread. */
export function useAnimatedCurve(curve: number[]): SharedValue<number[]> {
  const from = useSharedValue(curve);
  const to = useSharedValue(curve);
  const t = useSharedValue(1);
  const shown = useDerivedValue(() =>
    from.value.map((a, i) => a + ((to.value[i] ?? 0) - a) * t.value),
  );
  useEffect(() => {
    from.set(shown.get());
    to.set(curve);
    t.set(0);
    t.set(
      withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [curve, from, to, t, shown]);
  return shown;
}

/** SVG path data of the line and of the area between it and the 0 dB line. */
export function curvePaths(
  db: number[],
  width: number,
): { line: string; area: string } {
  "worklet";
  const mid = CURVE_HEIGHT / 2;
  const step = width / (db.length - 1);
  let line = "";
  for (let i = 0; i < db.length; i++) {
    const v = Math.max(-SPAN, Math.min(SPAN, db[i]));
    const y = mid - (v / SPAN) * (mid - PAD);
    line += `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
  }
  return { line, area: `${line}L${width} ${mid}L0 ${mid}Z` };
}

/** The 0 dB line plus faint lines every 6 dB and at 100 Hz, 1 kHz and 10 kHz. */
export function gridPaths(width: number): { zero: string; rest: string } {
  const mid = CURVE_HEIGHT / 2;
  const dy = ((mid - PAD) * 6) / SPAN;
  let rest = "";
  for (const k of [-2, -1, 1, 2])
    rest += `M0 ${(mid + k * dy).toFixed(1)}L${width} ${(mid + k * dy).toFixed(1)}`;
  for (const x of GRID_HZ.map(curvePosition))
    rest += `M${(x * width).toFixed(1)} 0L${(x * width).toFixed(1)} ${CURVE_HEIGHT}`;
  return { zero: `M0 ${mid}L${width} ${mid}`, rest };
}
