import { useMemo } from "react";
import Animated, {
  useAnimatedProps,
  useDerivedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { withAlpha } from "../../lib/color";
import {
  CURVE_HEIGHT as HEIGHT,
  curvePaths,
  gridPaths,
  useAnimatedCurve,
} from "./use-curve";

const AnimatedPath = Animated.createAnimatedComponent(Path);

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
  const lineProps = useAnimatedProps(() => ({ d: paths.value.line }));
  const areaProps = useAnimatedProps(() => ({ d: paths.value.area }));
  const grid = useMemo(() => gridPaths(width), [width]);
  return (
    <Svg width={width} height={HEIGHT} pointerEvents="none">
      <Defs>
        <LinearGradient id="eq-area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={withAlpha(color, 0.32)} />
          <Stop offset="0.5" stopColor={withAlpha(color, 0.03)} />
          <Stop offset="1" stopColor={withAlpha(color, 0.32)} />
        </LinearGradient>
      </Defs>
      <Path d={grid.rest} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <Path d={grid.zero} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
      <AnimatedPath animatedProps={areaProps} fill="url(#eq-area)" />
      <AnimatedPath
        animatedProps={lineProps}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
