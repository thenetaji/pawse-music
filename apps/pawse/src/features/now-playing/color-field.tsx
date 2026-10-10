import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useId, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import type { Palette } from "./palette";

// White radial falloff, tinted per pool; far cheaper to draw on Android than an SVG gradient.
const BLOB = require("../../../assets/images/soft-blob.png");
const FADE_MS = 1100;

// Four soft colour pools drifting behind everything; each pool crossfades to its new colour.
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
      <Animated.View
        entering={FadeIn.duration(FADE_MS)}
        style={StyleSheet.absoluteFill}
      >
        {palette.colors.map((c, i) => (
          <Pool key={i} color={c} drift={DRIFT[i]} playing={playing} />
        ))}
      </Animated.View>
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.04)",
          "rgba(0,0,0,0.14)",
          "rgba(0,0,0,0.5)",
          "rgba(0,0,0,0.78)",
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

  // Two stacked layers: a new colour goes on the hidden one, then only opacity animates.
  const [pair, setPair] = useState({ a: color, b: color, front: 0 });
  if (color !== (pair.front === 0 ? pair.a : pair.b))
    setPair(
      pair.front === 0
        ? { ...pair, b: color, front: 1 }
        : { ...pair, a: color, front: 0 },
    );
  const mix = useSharedValue(0);
  useEffect(() => {
    mix.set(withTiming(pair.front, { duration: FADE_MS }));
  }, [pair.front, mix]);

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
      <Layer color={pair.a} size={size} mix={mix} show={0} />
      <Layer color={pair.b} size={size} mix={mix} show={1} />
    </Animated.View>
  );
}

function Layer({
  color,
  size,
  mix,
  show,
}: {
  color: string;
  size: number;
  mix: SharedValue<number>;
  show: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - Math.abs(mix.value - show),
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      {Platform.OS === "web" ? (
        <SvgBlob color={color} size={size} />
      ) : (
        <Image
          source={BLOB}
          resizeMode="stretch"
          fadeDuration={0}
          style={{ width: size, height: size, tintColor: color }}
        />
      )}
    </Animated.View>
  );
}

// Web keeps the vector gradient; a tinted image there needs an SVG filter, which costs more.
function SvgBlob({ color, size }: { color: string; size: number }) {
  const id = `g${useId().replace(/:/g, "")}`;
  return (
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
  );
}
