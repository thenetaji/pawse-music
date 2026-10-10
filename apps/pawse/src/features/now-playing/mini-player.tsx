import { artistLine } from "@pawse/music-core";
import { player, usePlayerState, useProgress } from "@pawse/player";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { TrackArt } from "../../components/artwork";
import { Spinner, useBusy } from "../../components/spinner";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { NextGlyph, PauseGlyph, PlayGlyph } from "./icons";
import { useAccent } from "./now-palette";

// Lives in the iOS 26 tab bar accessory (or floats above the tab bar elsewhere).
// Tap opens the player; swipe left/right to skip.
export function MiniPlayer({ inline }: { inline?: boolean }) {
  const { current, status } = usePlayerState();
  const { position, duration } = useProgress();
  const accent = useAccent();
  const busy = useBusy(status);
  const x = useSharedValue(0);
  const press = useSharedValue(1);

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => x.set(e.translationX * 0.9))
    .onEnd((e) => {
      const go = Math.abs(e.translationX) > 60 || Math.abs(e.velocityX) > 600;
      if (!go) {
        x.set(withSpring(0, { damping: 14, stiffness: 220 }));
        return;
      }
      haptic.medium();
      const dir = e.translationX < 0 ? -1 : 1;
      x.set(
        withSequence(
          withTiming(dir * 260, { duration: 140 }),
          withTiming(-dir * 120, { duration: 0 }),
          withSpring(0, { damping: 14, stiffness: 200 }),
        ),
      );
      if (dir < 0) player.next();
      else player.previous();
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: press.value }],
    opacity: 1 - Math.min(0.6, Math.abs(x.value) / 300),
  }));

  if (!current) return null;
  const playing = status === "playing" || status === "buffering";
  const frac = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <GestureDetector gesture={swipe}>
      <Pressable
        onPress={() => {
          haptic.light();
          push("/now-playing");
        }}
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
            <Text style={styles.title} numberOfLines={1}>
              {current.title}
            </Text>
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
              <Spinner size={inline ? 18 : 22} />
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
        {!inline && (
          <View style={styles.progress}>
            <View
              style={[
                styles.progressFill,
                { width: `${frac * 100}%`, backgroundColor: accent },
              ]}
            />
          </View>
        )}
      </Pressable>
    </GestureDetector>
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
