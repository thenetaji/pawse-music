import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useId } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import type { Palette } from "./palette";

// Four soft colour pools drifting behind everything; crossfades when the artwork changes.
export function ColorField({
  palette,
  playing,
}: {
  palette: Palette;
  playing: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
      {/* Keyed by colours: the old field fades out while the new one fades in. */}
      <Animated.View
        key={palette.colors.join()}
        entering={FadeIn.duration(1100)}
        exiting={FadeOut.duration(1100)}
        style={StyleSheet.absoluteFill}
      >
        <Pools palette={palette} playing={playing} />
      </Animated.View>
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.04)",
          "rgba(0,0,0,0.16)",
          "rgba(0,0,0,0.7)",
          "#000",
        ]}
        locations={[0, 0.45, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const DRIFT = [
  { top: -0.3, left: -0.4, dx: 0.28, dy: 0.22, s: 1.15, ms: 19000 },
  { top: 0.05, left: 0.55, dx: -0.3, dy: 0.25, s: 0.9, ms: 23000 },
  { top: 0.55, left: -0.35, dx: 0.25, dy: -0.28, s: 1.1, ms: 21000 },
  { top: 0.75, left: 0.4, dx: -0.22, dy: -0.3, s: 1.2, ms: 26000 },
];

function Pools({ palette, playing }: { palette: Palette; playing: boolean }) {
  return (
    <>
      {palette.colors.map((c, i) => (
        <Pool key={i} color={c} drift={DRIFT[i]} playing={playing} />
      ))}
    </>
  );
}

function Pool({
  color,
  drift,
  playing,
}: {
  color: string;
  drift: (typeof DRIFT)[number];
  playing: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const size = width * 1.5;
  const id = `g${useId().replace(/:/g, "")}`;
  const t = useSharedValue(0);
  useEffect(() => {
    // Slower drift while paused, so the screen breathes rather than stops.
    t.value = withRepeat(
      withTiming(1, {
        duration: playing ? drift.ms : drift.ms * 2.5,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [playing, drift.ms, t]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * drift.dx * width },
      { translateY: t.value * drift.dy * height * 0.5 },
      { scale: 1 + (drift.s - 1) * t.value },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          top: drift.top * height,
          left: drift.left * width,
        },
        style,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
