import Heart from "lucide-react-native/icons/heart";
import SkipBack from "lucide-react-native/icons/skip-back";
import SkipForward from "lucide-react-native/icons/skip-forward";
import Volume1 from "lucide-react-native/icons/volume-1";
import Volume2 from "lucide-react-native/icons/volume-2";
import VolumeX from "lucide-react-native/icons/volume-x";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { SEEK_SEC } from "../../lib/cover-gestures";
import { display } from "../../lib/type";
import { GestureCat } from "../cat/alt/gesture-cat";

const HEART = 92;
const BUBBLE = 84;

export type SkipNote = { side: -1 | 1; n: number };
export type HeartNote = { n: number; x: number; y: number };

/** The volume while a finger slides on the cover: icon, bar and percent, fading out after release. */
export function VolumePill({
  level,
  shown,
}: {
  level: SharedValue<number>;
  shown: SharedValue<number>;
}) {
  const [pct, setPct] = useState(0);
  // Only this pill re-renders as the finger moves.
  useAnimatedReaction(
    () => Math.round(level.get() * 100),
    (now, was) => {
      if (now !== was) scheduleOnRN(setPct, now);
    },
  );
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const fill = useAnimatedStyle(() => ({ width: `${level.get() * 100}%` }));
  const Icon = pct === 0 ? VolumeX : pct < 50 ? Volume1 : Volume2;
  return (
    <Animated.View pointerEvents="none" style={[styles.pillWrap, fade]}>
      <View style={styles.pill}>
        <GestureCat dance="party" size={30} />
        <Icon size={18} color="#fff" strokeWidth={2} />
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fill]} />
        </View>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
    </Animated.View>
  );
}

/** The "10 s" bubble on the side that was double-tapped; repeated taps count up. */
export function SkipBubble({ note }: { note: SkipNote }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.set(
      withSequence(
        withTiming(1.12, { duration: 60 }),
        withSpring(1, { damping: 12, stiffness: 380 }),
      ),
    );
  }, [note.n, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const Icon = note.side < 0 ? SkipBack : SkipForward;
  return (
    <Animated.View
      entering={FadeIn.duration(100)}
      exiting={FadeOut.duration(220)}
      pointerEvents="none"
      style={[styles.bubbleWrap, note.side < 0 ? styles.left : styles.right]}
    >
      <GestureCat dance="pounce" size={56} flip={note.side < 0} />
      <Animated.View style={[styles.bubble, style]}>
        <Icon size={22} color="#fff" strokeWidth={2} fill="#fff" />
        <Text style={styles.bubbleText}>{note.n * SEEK_SEC} s</Text>
      </Animated.View>
    </Animated.View>
  );
}

/** A heart that pops where the cover was double-tapped. */
export function HeartPop({ note }: { note: HeartNote }) {
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(9).stiffness(260)}
      exiting={FadeOut.duration(260)}
      pointerEvents="none"
      style={[
        styles.heart,
        { left: note.x - HEART / 2, top: note.y - HEART / 2 },
      ]}
    >
      <Heart size={HEART} color="#FF4F6D" fill="#FF4F6D" strokeWidth={1.5} />
      <View style={styles.heartCat}>
        <GestureCat dance="confetti" size={HEART * 0.62} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  track: {
    width: 110,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  fill: { height: "100%", backgroundColor: "#fff" },
  pct: {
    width: 40,
    color: "#fff",
    fontSize: 13,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    ...display("700"),
  },
  bubbleWrap: {
    position: "absolute",
    top: "50%",
    width: "33.33%",
    marginTop: -BUBBLE / 2 - 56,
    alignItems: "center",
  },
  left: { left: 0 },
  right: { right: 0 },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  bubbleText: { color: "#fff", fontSize: 14, ...display("700") },
  heart: { position: "absolute", width: HEART, height: HEART },
  heartCat: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
