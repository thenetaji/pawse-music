import { useEffect, useState } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

import { BAR_COUNT, watchBars } from "../../lib/audio-fx/bars";

const GAP = 6;
const HEIGHT = 56;

export function Visualiser({
  color,
  width,
  style,
}: {
  color: string;
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0));
  useEffect(() => watchBars(setBars), []);
  const barWidth = (width - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width,
          height: HEIGHT,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: GAP,
        },
        style,
      ]}
    >
      {bars.map((v, i) => (
        <View
          key={i}
          style={{
            width: barWidth,
            height: 4 + v * (HEIGHT - 4),
            borderRadius: barWidth / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
