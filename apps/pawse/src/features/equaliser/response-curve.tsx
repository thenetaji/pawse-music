import { Canvas, LinearGradient, Path, vec } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { withAlpha } from "../../lib/color";
import {
  CURVE_HEIGHT as HEIGHT,
  curvePaths,
  gridPaths,
  useAnimatedCurve,
} from "./use-curve";

// What the equaliser does to the sound, per frequency, drawn in the song's colour.
export function ResponseCurve({
  curve,
  color,
  width,
}: {
  curve: number[];
  color: string;
  width: number;
}) {
  const shown = useAnimatedCurve(curve);
  const paths = useDerivedValue(() => curvePaths(shown.value, width));
  const line = useDerivedValue(() => paths.value.line);
  const area = useDerivedValue(() => paths.value.area);
  const grid = useMemo(() => gridPaths(width), [width]);
  return (
    <Canvas style={{ width, height: HEIGHT }} pointerEvents="none">
      <Path
        path={grid.rest}
        style="stroke"
        strokeWidth={1}
        color="rgba(255,255,255,0.08)"
      />
      <Path
        path={grid.zero}
        style="stroke"
        strokeWidth={1}
        color="rgba(255,255,255,0.28)"
      />
      <Path path={area}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, HEIGHT)}
          colors={[
            withAlpha(color, 0.32),
            withAlpha(color, 0.03),
            withAlpha(color, 0.32),
          ]}
          positions={[0, 0.5, 1]}
        />
      </Path>
      <Path
        path={line}
        style="stroke"
        strokeWidth={2.5}
        strokeJoin="round"
        strokeCap="round"
        color={color}
      />
    </Canvas>
  );
}
