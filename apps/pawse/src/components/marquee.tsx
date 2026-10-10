import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useState } from "react";
import {
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useSetting } from "../lib/settings";

const GAP = 40;
const EDGE = 14;

// One line that slides sideways when it's too long, like Apple Music's titles: wait, scroll
// until a second copy lands where the first began, wait again. Fits or reduce motion: plain text.
export function Marquee({
  children,
  style,
  speed = 30,
  delay = 2000,
  fadeColor = "transparent",
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  /** Pixels per second. */
  speed?: number;
  /** Pause at the start, in ms. */
  delay?: number;
  /** The background behind the text, for soft edges; "transparent" means none. */
  fadeColor?: string;
}) {
  const reduceSetting = useSetting("reduceMotion", false);
  const reduceSystem = useReducedMotion();
  const [box, setBox] = useState(0);
  const [full, setFull] = useState(0);
  const run = !reduceSetting && !reduceSystem && box > 0 && full > box + 1;
  const w = Math.ceil(full) + 1;
  const cycle = w + GAP;
  const text = typeof children === "string" ? children : undefined;

  const x = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(x);
    x.set(0);
    if (!run) return;
    x.set(
      withRepeat(
        withSequence(
          withDelay(
            delay,
            withTiming(cycle, {
              duration: (cycle / speed) * 1000,
              easing: Easing.linear,
            }),
          ),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(x);
  }, [run, cycle, speed, delay, text, x]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -x.value }],
  }));
  // The left edge only fades while the text is moving.
  const leftStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, x.value / 12, (cycle - x.value) / 12)),
  }));
  const fade = run && fadeColor !== "transparent";

  return (
    <View
      style={styles.clip}
      onLayout={(e) => setBox(e.nativeEvent.layout.width)}
    >
      <View style={styles.measure} pointerEvents="none" aria-hidden>
        <Text
          style={style}
          numberOfLines={1}
          onLayout={(e) => setFull(e.nativeEvent.layout.width)}
        >
          {children}
        </Text>
      </View>
      {run ? (
        <Animated.View style={[styles.row, { width: cycle + w }, rowStyle]}>
          <Text style={[style, { width: w }]} numberOfLines={1}>
            {children}
          </Text>
          <Text
            style={[style, { width: w, marginLeft: GAP }]}
            numberOfLines={1}
            aria-hidden
          >
            {children}
          </Text>
        </Animated.View>
      ) : (
        <Text style={style} numberOfLines={1}>
          {children}
        </Text>
      )}
      {fade ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.edge, { left: 0 }, leftStyle]}
          >
            <LinearGradient
              colors={[fadeColor, clear(fadeColor)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <LinearGradient
            pointerEvents="none"
            colors={[clear(fadeColor), fadeColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.edge, { right: 0 }]}
          />
        </>
      ) : null}
    </View>
  );
}

// The same colour at zero alpha, so the gradient doesn't pass through grey.
function clear(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : "rgba(0,0,0,0)";
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  measure: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 9999,
    flexDirection: "row",
    alignItems: "flex-start",
    opacity: 0,
  },
  row: { flexDirection: "row" },
  edge: { position: "absolute", top: 0, bottom: 0, width: EDGE },
});
