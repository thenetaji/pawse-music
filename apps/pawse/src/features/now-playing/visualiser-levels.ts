import { useEffect } from "react";
import {
  type SharedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import {
  BAR_COUNT,
  barLevels,
  easeLevels,
  silentBands,
  synthBands,
  watchBars,
} from "../../lib/audio-fx/bars";
import { useMeterable } from "../../lib/audio-fx/use-eq-status";

export const VISUALISER_HEIGHT = 48;
/** Length of the tallest bar; the rest of the band is room for the glow. */
export const VISUALISER_REACH = 30;

/** Bar thickness for a band of this width. */
export const barThickness = (width: number): number =>
  Math.max(2, Math.min(4, (width / BAR_COUNT) * 0.36));

/**
 * Bar heights, 0 to 1, eased on the UI thread; they settle to zero while paused.
 * A song the meter can't hear (iPhone's piecewise playback, a web source without
 * CORS) gets a gentle synthetic drift instead.
 */
export function useBarLevels(playing: boolean): SharedValue<number[]> {
  const meterable = useMeterable();
  const target = useSharedValue<number[]>(silentBands());
  const level = useSharedValue<number[]>(silentBands());
  const bars = useSharedValue<number[]>(Array(BAR_COUNT).fill(0));
  const synthetic = useSharedValue(false);

  useEffect(() => {
    if (!playing) {
      synthetic.value = false;
      target.value = silentBands();
      return;
    }
    if (!meterable) {
      synthetic.value = true;
      return;
    }
    return watchBars((bands) => {
      synthetic.value = bands === null;
      if (bands) target.value = bands;
    });
  }, [playing, meterable, target, synthetic]);

  useFrameCallback(({ timeSinceFirstFrame, timeSincePreviousFrame }) => {
    const prev = level.value;
    const goal = synthetic.value
      ? synthBands(timeSinceFirstFrame, prev.length)
      : target.value;
    const next = easeLevels(prev, goal, timeSincePreviousFrame ?? 16);
    if (next.some((v, i) => v > 0.0005 || Math.abs(v - prev[i]) > 0.0005)) {
      level.value = next;
      bars.value = barLevels(next, timeSinceFirstFrame);
    }
  });

  return bars;
}
