import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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

// A short swipe only reveals the button (like Mail); a swipe past FULL of the width acts at once.
const OPEN = 104;
const FULL = 0.62;
const SPRING = { damping: 22, stiffness: 240 };

let lastSwipe = 0;
/** True right after a swipe, so the row's tap handler can ignore the release that ended it. */
export const swipedRecently = () => Date.now() - lastSwipe < 400;
const markSwipe = () => {
  lastSwipe = Date.now();
};

// Only one row stays open; touching another row closes it.
let openRow: { id: object; close: () => void } | null = null;
const setOpenRow = (row: typeof openRow) => {
  openRow = row;
};

/**
 * Swipe right for `right`, left for `left`. A short swipe opens a button to tap; letting go
 * early or swiping back cancels, and only a long deliberate swipe commits straight away.
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
  const start = useSharedValue(0);
  const width = useSharedValue(1);
  const armed = useSharedValue(0);
  const [id] = useState(() => ({}));
  const [open, setOpen] = useState<0 | 1 | -1>(0);

  const close = () => {
    x.set(withSpring(0, SPRING));
    setOpen(0);
    if (openRow?.id === id) setOpenRow(null);
  };

  const commit = (dir: 1 | -1) => {
    const action = dir === 1 ? right : left;
    if (!action) return;
    haptic.light();
    if (openRow?.id === id) setOpenRow(null);
    setOpen(0);
    x.set(withTiming(dir * width.get(), { duration: 170 }));
    // Let the slide-out read before the list changes, then reset for reuse.
    setTimeout(() => {
      action.onCommit();
      x.set(0);
    }, 180);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-22, 22])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      if (openRow && openRow.id !== id) openRow.close();
    })
    .onStart(() => {
      markSwipe();
      start.set(x.get());
    })
    .onUpdate((e) => {
      markSwipe();
      const t = start.get() + e.translationX;
      // No action that way: a little give, then it stops.
      const allowed = (t > 0 && right) || (t < 0 && left);
      x.set(allowed ? t : t * 0.12);
      const limit = width.get() * FULL;
      const next = !allowed ? 0 : t > limit ? 1 : t < -limit ? -1 : 0;
      if (next !== armed.get()) {
        armed.set(next);
        if (next) haptic.medium();
        else haptic.tick();
      }
    })
    .onEnd((e) => {
      markSwipe();
      const dir = armed.get();
      armed.set(0);
      if (dir === 1 || dir === -1) {
        commit(dir);
        return;
      }
      const t = x.get();
      // Flicking back toward the middle on release means "never mind".
      const back =
        (t > 0 && e.velocityX < -300) || (t < 0 && e.velocityX > 300);
      const side =
        t > OPEN * 0.55 && right ? 1 : t < -OPEN * 0.55 && left ? -1 : 0;
      if (!side || back) {
        close();
        return;
      }
      x.set(withSpring(side * OPEN, SPRING));
      setOpen(side);
      setOpenRow({ id, close });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  // Colour fills only the strip the row has uncovered, so transparent rows don't tint.
  const rightBg = useAnimatedStyle(() => ({ width: Math.max(0, x.value) }));
  const leftBg = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));
  const rightLabel = useAnimatedStyle(() => ({
    opacity: interpolate(x.value / OPEN, [0, 0.5, 1], [0, 0.4, 1], "clamp"),
    transform: [{ scale: x.value > width.value * FULL ? 1.12 : 1 }],
  }));
  const leftLabel = useAnimatedStyle(() => ({
    opacity: interpolate(-x.value / OPEN, [0, 0.5, 1], [0, 0.4, 1], "clamp"),
    transform: [{ scale: -x.value > width.value * FULL ? 1.12 : 1 }],
  }));

  return (
    <View onLayout={(e) => width.set(e.nativeEvent.layout.width || 1)}>
      {right ? (
        <Animated.View
          style={[
            styles.bg,
            { left: 0, backgroundColor: right.color, alignItems: "flex-end" },
            rightBg,
          ]}
        >
          <Pressable
            disabled={open !== 1}
            onPress={() => commit(1)}
            style={styles.button}
          >
            <Animated.Text style={[styles.label, rightLabel]} numberOfLines={1}>
              {right.label}
            </Animated.Text>
          </Pressable>
        </Animated.View>
      ) : null}
      {left ? (
        <Animated.View
          style={[
            styles.bg,
            { right: 0, backgroundColor: left.color, alignItems: "flex-start" },
            leftBg,
          ]}
        >
          <Pressable
            disabled={open !== -1}
            onPress={() => commit(-1)}
            style={styles.button}
          >
            <Animated.Text style={[styles.label, leftLabel]} numberOfLines={1}>
              {left.label}
            </Animated.Text>
          </Pressable>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          {children}
          {open ? (
            // While open, a tap on the row only closes it.
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          ) : null}
        </Animated.View>
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
  button: {
    width: OPEN,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { color: "#000", fontSize: 14, ...display("800") },
});
