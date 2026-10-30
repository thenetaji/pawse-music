import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { BAR_COUNT } from "../../lib/audio-fx/bars";
import { withAlpha } from "../../lib/color";
import {
  barThickness,
  useBarLevels,
  VISUALISER_HEIGHT as HEIGHT,
  VISUALISER_REACH as REACH,
} from "./visualiser-levels";

function Bar({
  i,
  bars,
  thickness,
  gap,
  color,
}: {
  i: number;
  bars: SharedValue<number[]>;
  thickness: number;
  gap: number;
  color: string;
}) {
  const height = useAnimatedStyle(() => ({
    height: thickness + (bars.value[i] ?? 0) * (REACH - thickness),
  }));
  // react-native-web passes these CSS-only properties through.
  const look = {
    backgroundImage: `linear-gradient(to bottom, ${withAlpha(color, 0.4)}, ${color}, ${withAlpha(color, 0.4)})`,
    boxShadow: `0 0 8px ${withAlpha(color, 0.55)}`,
  } as ViewStyle;
  return (
    <Animated.View
      style={[
        {
          width: thickness,
          marginHorizontal: gap / 2,
          borderRadius: thickness / 2,
        },
        look,
        height,
      ]}
    />
  );
}

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
  const thickness = barThickness(width);
  const gap = width / BAR_COUNT - thickness;
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width,
          height: HEIGHT,
          flexDirection: "row",
          alignItems: "center",
        },
        style,
      ]}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <Bar
          key={i}
          i={i}
          bars={bars}
          thickness={thickness}
          gap={gap}
          color={color}
        />
      ))}
    </View>
  );
}
