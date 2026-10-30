import { Canvas, RoundedRect } from "@shopify/react-native-skia";
import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";

import { BAR_COUNT, watchBars } from "../../lib/audio-fx/bars";

const GAP = 6;
const HEIGHT = 56;

function Bar({
  i,
  bars,
  width,
  color,
}: {
  i: number;
  bars: SharedValue<number[]>;
  width: number;
  color: string;
}) {
  const height = useDerivedValue(() => 4 + (bars.value[i] ?? 0) * (HEIGHT - 4));
  const y = useDerivedValue(() => HEIGHT - height.value);
  return (
    <RoundedRect
      x={i * (width + GAP)}
      y={y}
      width={width}
      height={height}
      r={width / 2}
      color={color}
    />
  );
}

export function Visualiser({
  color,
  width,
  style,
}: {
  color: string;
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  const bars = useSharedValue<number[]>(Array(BAR_COUNT).fill(0));
  useEffect(() => watchBars((b) => (bars.value = b)), [bars]);
  const barWidth = (width - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
  return (
    <Canvas style={[{ width, height: HEIGHT }, style]} pointerEvents="none">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <Bar key={i} i={i} bars={bars} width={barWidth} color={color} />
      ))}
    </Canvas>
  );
}
