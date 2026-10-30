import { useEffect } from "react";
import {
  type SharedValue,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import {
  BAR_COUNT,
  easeLevels,
  mirrorBars,
  silentBands,
  watchBars,
} from "../../lib/audio-fx/bars";

export const VISUALISER_HEIGHT = 48;
/** Length of the tallest bar; the rest of the band is room for the glow. */
export const VISUALISER_REACH = 30;

/** Bar thickness for a band of this width. */
export const barThickness = (width: number): number =>
  Math.max(2, Math.min(4, (width / BAR_COUNT) * 0.36));

/** Bar heights, 0 to 1, eased on the UI thread; they settle to zero while paused. */
export function useBarLevels(playing: boolean): SharedValue<number[]> {
  const target = useSharedValue<number[]>(silentBands());
  const level = useSharedValue<number[]>(silentBands());

  useEffect(() => {
    if (!playing) {
      target.value = silentBands();
      return;
    }
    return watchBars((bands) => {
      target.value = bands;
    });
  }, [playing, target]);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    const prev = level.value;
    const next = easeLevels(prev, target.value, timeSincePreviousFrame ?? 16);
    if (next.some((v, i) => Math.abs(v - prev[i]) > 0.0005)) level.value = next;
  });

  return useDerivedValue(() => mirrorBars(level.value));
}
