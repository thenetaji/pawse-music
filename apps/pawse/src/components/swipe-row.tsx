import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { haptic } from "../lib/haptics";
import { display } from "../lib/type";

type Action = { label: string; color: string; onCommit: () => void };

// Past this share of the row's width a swipe commits on release; anything shorter springs back.
const COMMIT = 0.4;
const SPRING = { damping: 20, stiffness: 260 };

let lastSwipe = 0;
/** True right after a swipe, so the row's tap handler can ignore the release that ended it. */
export const swipedRecently = () => Date.now() - lastSwipe < 400;
const markSwipe = () => {
  lastSwipe = Date.now();
};

/**
 * Swipe right for `right`, left for `left`. The row follows the finger; crossing the commit point
 * ticks and lights the label, and dragging back before letting go cancels.
 */
export function SwipeRow({
  children,
  right,
  left,
}: {
  children: ReactNode;
  right?: Action;
  left?: Action;
}) {
  const x = useSharedValue(0);
  const width = useSharedValue(1);
  const armed = useSharedValue(0);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onStart(markSwipe)
    .onUpdate((e) => {
      markSwipe();
      const t = e.translationX;
      // No action that way: a little give, then it stops.
      const allowed = (t > 0 && right) || (t < 0 && left);
      x.set(allowed ? t : t * 0.15);
      const limit = width.get() * COMMIT;
      const next = !allowed ? 0 : t > limit ? 1 : t < -limit ? -1 : 0;
      if (next !== armed.get()) {
        armed.set(next);
        if (next) haptic.medium();
        else haptic.tick();
      }
    })
    .onEnd(() => {
      markSwipe();
      const dir = armed.get();
      armed.set(0);
      const action = dir === 1 ? right : dir === -1 ? left : undefined;
      if (!action) {
        x.set(withSpring(0, SPRING));
        return;
      }
      x.set(withTiming(dir * width.get(), { duration: 160 }));
      // Let the slide-out read before the list changes, then reset for reuse.
      setTimeout(() => {
        action.onCommit();
        x.set(0);
      }, 170);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  // Colour fills only the strip the row has uncovered, so transparent rows don't tint.
  const rightBg = useAnimatedStyle(() => ({ width: Math.max(0, x.value) }));
  const leftBg = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));
  const rightLabel = useAnimatedStyle(() => {
    const p = Math.min(1, x.value / (width.value * COMMIT));
    return {
      opacity: interpolate(p, [0, 0.4, 1], [0, 0.6, 1]),
      transform: [{ scale: p >= 1 ? 1.08 : 0.9 + p * 0.1 }],
    };
  });
  const leftLabel = useAnimatedStyle(() => {
    const p = Math.min(1, -x.value / (width.value * COMMIT));
    return {
      opacity: interpolate(p, [0, 0.4, 1], [0, 0.6, 1]),
      transform: [{ scale: p >= 1 ? 1.08 : 0.9 + p * 0.1 }],
    };
  });

  return (
    <View onLayout={(e) => width.set(e.nativeEvent.layout.width || 1)}>
      {right ? (
        <Animated.View
          style={[
            styles.bg,
            { left: 0, backgroundColor: right.color, alignItems: "flex-start" },
            rightBg,
          ]}
        >
          <Animated.View style={[styles.labelBox, rightLabel]}>
            <Text style={styles.label} numberOfLines={1}>
              {right.label}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      {left ? (
        <Animated.View
          style={[
            styles.bg,
            { right: 0, backgroundColor: left.color, alignItems: "flex-end" },
            leftBg,
          ]}
        >
          <Animated.View style={[styles.labelBox, leftLabel]}>
            <Text
              style={[styles.label, { textAlign: "right" }]}
              numberOfLines={1}
            >
              {left.label}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // No padding here: the strip must be zero wide at rest.
  bg: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  labelBox: { width: 120, marginHorizontal: 22 },
  label: { color: "#000", fontSize: 15, ...display("800") },
});
