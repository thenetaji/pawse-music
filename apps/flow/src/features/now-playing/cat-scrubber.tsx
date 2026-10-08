import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Cat, type CatMood } from "../cat/cat";

const CAT = 50;

type Props = {
  position: number;
  duration: number;
  mood: CatMood;
  cups: [string, string];
  onSeek: (sec: number) => void;
};

// The progress line is a wire the cat sits on; drag the cat (or anywhere on the line) to seek.
export function CatScrubber({ position, duration, mood, cups, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const lift = useSharedValue(0);

  const frac =
    duration > 0 ? Math.min(1, Math.max(0, (drag ?? position) / duration)) : 0;
  const x = frac * width;

  const toSec = (px: number) =>
    width > 0 ? Math.min(1, Math.max(0, px / width)) * duration : 0;
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .hitSlop({ top: 24, bottom: 16 })
    .onBegin((e) => {
      lift.set(withSpring(1, { damping: 14, stiffness: 260 }));
      setDrag(toSec(e.x));
    })
    .onUpdate((e) => setDrag(toSec(e.x)))
    .onFinalize((e) => {
      lift.set(withSpring(0, { damping: 12, stiffness: 220 }));
      onSeek(toSec(e.x));
      setDrag(null);
    });

  const catStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -lift.value * 10 },
      { scale: 1 + lift.value * 0.18 },
    ],
  }));

  const catLeft = Math.min(
    Math.max(x - CAT / 2, -8),
    Math.max(0, width - CAT + 8),
  );

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          style={styles.hit}
          onLayout={(e: LayoutChangeEvent) =>
            setWidth(e.nativeEvent.layout.width)
          }
        >
          <View style={styles.wire}>
            <View style={[styles.played, { width: x }]} />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[styles.cat, { left: catLeft }, catStyle]}
          >
            <Cat
              mood={drag !== null ? "curious" : mood}
              size={CAT}
              cups={cups}
            />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={[styles.time, drag !== null && styles.timeLive]}>
          {fmt(drag ?? position)}
        </Text>
        <Text style={styles.time}>
          -{fmt(Math.max(0, duration - (drag ?? position)))}
        </Text>
      </View>
    </View>
  );
}

function fmt(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  hit: { height: 58, justifyContent: "flex-end", paddingBottom: 6 },
  wire: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  played: { height: 4, backgroundColor: "rgba(255,255,255,0.85)" },
  cat: { position: "absolute", bottom: 1, width: CAT, height: CAT },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  time: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  timeLive: { color: "#fff" },
});
