import {
  BlurMask,
  Canvas,
  LinearGradient,
  Path,
  vec,
} from "@shopify/react-native-skia";
import type { StyleProp, ViewStyle } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

import { BAR_COUNT } from "../../lib/audio-fx/bars";
import { withAlpha } from "../../lib/color";
import {
  barThickness,
  useBarLevels,
  VISUALISER_HEIGHT as HEIGHT,
  VISUALISER_REACH as REACH,
} from "./visualiser-levels";

// Thin rounded bars, bass on the left, drawn as one stroked path whose string is rebuilt on the UI thread.
export function Visualiser({
  color,
  width,
  playing,
  style,
}: {
  color: string;
  width: number;
  playing: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bars = useBarLevels(playing);
  const slot = width / BAR_COUNT;
  const thickness = barThickness(width);
  const d = useDerivedValue(() => {
    let s = "";
    for (let i = 0; i < BAR_COUNT; i++) {
      const x = (slot * (i + 0.5)).toFixed(1);
      const half = Math.max(0.5, ((bars.value[i] ?? 0) * REACH) / 2);
      s += `M${x} ${(HEIGHT / 2 - half).toFixed(1)}L${x} ${(HEIGHT / 2 + half).toFixed(1)}`;
    }
    return s;
  });
  return (
    <Canvas style={[{ width, height: HEIGHT }, style]} pointerEvents="none">
      <Path
        path={d}
        style="stroke"
        strokeWidth={thickness}
        strokeCap="round"
        color={color}
        opacity={0.5}
      >
        <BlurMask blur={7} style="solid" />
      </Path>
      <Path path={d} style="stroke" strokeWidth={thickness} strokeCap="round">
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, HEIGHT)}
          colors={[withAlpha(color, 0.4), color, withAlpha(color, 0.4)]}
          positions={[0, 0.5, 1]}
        />
      </Path>
    </Canvas>
  );
}
