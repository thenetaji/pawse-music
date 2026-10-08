import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// Three bouncing bars for the row that is playing; frozen when paused.
export function EqBars({
  color,
  playing,
  size = 14,
}: {
  color: string;
  playing: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      {[0, 1, 2].map((i) => (
        <Bar key={i} i={i} color={color} playing={playing} size={size} />
      ))}
    </View>
  );
}

function Bar({
  i,
  color,
  playing,
  size,
}: {
  i: number;
  color: string;
  playing: boolean;
  size: number;
}) {
  const h = useSharedValue(0.35);
  useEffect(() => {
    if (!playing) {
      cancelAnimation(h);
      h.value = withTiming(0.3 + i * 0.15, { duration: 200 });
      return;
    }
    h.value = withDelay(
      i * 120,
      withRepeat(
        withTiming(1, {
          duration: 380 + i * 90,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      ),
    );
  }, [playing, i, h]);
  const style = useAnimatedStyle(() => ({
    height: Math.max(2, h.value * size),
  }));
  return (
    <Animated.View
      style={[
        { width: size / 4, borderRadius: 1.5, backgroundColor: color },
        style,
      ]}
    />
  );
}
