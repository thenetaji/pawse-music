import { artistLine } from "@pawse/music-core";
import { player, usePlayerState, useProgress } from "@pawse/player";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { TrackArt } from "../../components/artwork";
import { CatSpinner } from "../../components/cat-spinner";
import { Marquee } from "../../components/marquee";
import { useBusy } from "../../components/spinner";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { NextGlyph, PauseGlyph, PlayGlyph } from "./icons";
import { useAccent } from "./now-palette";

const MAX_X = 70;
const LIFT_MAX = 18;
// No overshoot on the way back.
const CALM = { damping: 26, stiffness: 260 };

// Lives in the iOS 26 tab bar accessory (or floats above the tab bar elsewhere).
// Tap or flick up opens the player; swipe left/right to skip.
export function MiniPlayer({ inline }: { inline?: boolean }) {
  const { current, status } = usePlayerState();
  const busy = useBusy(status);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const press = useSharedValue(1);

  const open = () => {
    haptic.light();
    push("/now-playing");
  };
  const skip = (dir: -1 | 1) => {
    haptic.light();
    if (dir < 0) player.next();
    else player.previous();
  };
  // Both drags run on the UI thread, so the row tracks the finger without a JS round trip.
  const swipe = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    // Half the finger's travel, held to a short reach, so a swipe nudges rather than flings.
    .onUpdate((e) =>
      x.set(Math.max(-MAX_X, Math.min(MAX_X, e.translationX * 0.5))),
    )
    .onEnd((e) => {
      const go = Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 600;
      if (!go) {
        x.set(withSpring(0, CALM));
        return;
      }
      const dir = e.translationX < 0 ? -1 : 1;
      x.set(
        withSequence(
          withTiming(dir * MAX_X, { duration: 110 }),
          withTiming(-dir * 24, { duration: 0 }),
          withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }),
        ),
      );
      scheduleOnRN(skip, dir);
    });
  // Pull up (or flick up) to open the full player; the row lifts with the finger and settles back.
  const lift = Gesture.Pan()
    .activeOffsetY([-10, 1000])
    .failOffsetX([-14, 14])
    .onUpdate((e) => y.set(Math.max(-LIFT_MAX, e.translationY * 0.5)))
    .onEnd((e) => {
      y.set(withSpring(0, { ...CALM, velocity: e.velocityY }));
      if (e.translationY < -36 || e.velocityY < -500) scheduleOnRN(open);
    });
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { scale: press.get() },
    ],
    opacity: 1 - Math.min(0.7, Math.abs(x.get()) / 100),
  }));

  if (!current) return null;
  const playing = status === "playing" || status === "buffering";

  return (
    <GestureDetector gesture={Gesture.Race(swipe, lift)}>
      <Pressable
        onPress={open}
        onPressIn={() =>
          press.set(withSpring(0.97, { damping: 15, stiffness: 400 }))
        }
        onPressOut={() =>
          press.set(withSpring(1, { damping: 12, stiffness: 300 }))
        }
        style={styles.wrap}
      >
        <Animated.View style={[styles.row, inline && styles.inline, style]}>
          <Animated.View key={current.id} entering={FadeIn.duration(250)}>
            <TrackArt
              track={current}
              size={inline ? 26 : 36}
              radius={inline ? 6 : 8}
            />
          </Animated.View>
          <View style={styles.text}>
            <Marquee style={styles.title}>{current.title}</Marquee>
            {!inline && (
              <Text style={styles.sub} numberOfLines={1}>
                {busy === "slow"
                  ? "Still loading, the connection is slow…"
                  : artistLine(current.artists)}
              </Text>
            )}
          </View>
          <Pressable
            hitSlop={10}
            accessibilityLabel={playing ? "Pause" : "Play"}
            onPress={() => {
              haptic.light();
              player.toggle();
            }}
            style={styles.btn}
          >
            {busy !== "no" ? (
              <CatSpinner size={inline ? 22 : 28} />
            ) : playing ? (
              <PauseGlyph size={inline ? 22 : 26} />
            ) : (
              <PlayGlyph size={inline ? 22 : 26} />
            )}
          </Pressable>
          {!inline && (
            <Pressable
              hitSlop={10}
              accessibilityLabel="Next"
              onPress={() => {
                haptic.light();
                player.next();
              }}
              style={styles.btn}
            >
              <NextGlyph size={24} />
            </Pressable>
          )}
        </Animated.View>
        {!inline && <Progress />}
      </Pressable>
    </GestureDetector>
  );
}

// The hairline under the row. It reads progress itself, so the row above never re-renders on the tick,
// and the fill glides between seconds on the UI thread instead of stepping.
function Progress() {
  const { position, duration } = useProgress();
  const accent = useAccent();
  const frac = duration > 0 ? Math.min(1, position / duration) : 0;
  const w = useSharedValue(frac);
  useEffect(() => {
    // Backwards (a new song, a seek back) and far jumps cut; the usual second glides to the next poll.
    const ahead = frac - w.get();
    w.set(
      ahead < 0 || ahead > 2 / Math.max(1, duration)
        ? frac
        : withTiming(frac, { duration: 1000, easing: Easing.linear }),
    );
  }, [frac, duration, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={styles.progress}>
      <Animated.View
        style={[styles.progressFill, { backgroundColor: accent }, fill]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center" },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    paddingRight: 6,
  },
  inline: { gap: 8, paddingLeft: 6 },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 12.5, marginTop: 1 },
  btn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: { height: 2 },
});
