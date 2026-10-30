import Volume from "lucide-react-native/icons/volume";
import Volume2 from "lucide-react-native/icons/volume-2";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { readVolume, setLevel, settleLevel } from "../../lib/screen-levels";
import { GestureCat } from "../cat/alt/gesture-cat";

const CAT = 44;

/** The phone's volume as a bar on Now playing; a cat rides its end while it's dragged. */
export function VolumeSlider() {
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const level = useSharedValue(0);
  const held = useSharedValue(0);

  // Follows the buttons on the side of the phone too.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    let gone = false;
    void readVolume().then((v) => {
      if (v === undefined || gone) return;
      level.set(v);
      setReady(true);
    });
    void import("react-native-volume-manager")
      .then((m) => {
        if (gone) return;
        sub = m.VolumeManager.addVolumeListener((r) => {
          if (!held.get()) level.set(r.volume);
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      sub?.remove();
    };
  }, [level, held]);

  // Moves from where the volume was, so a stray touch never jumps it.
  const start = useSharedValue(0);
  const drag = Gesture.Pan()
    .runOnJS(true)
    .hitSlop({ vertical: 10 })
    .onBegin(() => {
      start.set(level.get());
      setDragging(true);
      held.set(withTiming(1, { duration: 150 }));
    })
    .onUpdate((e) => {
      const v = Math.min(
        1,
        Math.max(0, start.get() + e.translationX / Math.max(1, width)),
      );
      level.set(v);
      setLevel("volume", v);
    })
    .onFinalize(() => {
      settleLevel("volume");
      setDragging(false);
      held.set(withTiming(0, { duration: 300 }));
    });

  // Like Apple Music's: the bar itself is the handle and swells under the finger, and the cat rides its end.
  const fill = useAnimatedStyle(() => ({ width: level.get() * width }));
  const track = useAnimatedStyle(() => ({
    height: 6 + held.get() * 6,
    opacity: 0.75 + held.get() * 0.25,
  }));
  const cat = useAnimatedStyle(() => ({
    opacity: held.get(),
    transform: [
      { translateX: level.get() * width - CAT / 2 },
      { translateY: (1 - held.get()) * 8 },
    ],
  }));

  if (Platform.OS === "web" || !ready) return null;
  return (
    <View style={styles.row}>
      <Volume size={14} color="rgba(255,255,255,0.45)" />
      <GestureDetector gesture={drag}>
        <View
          style={styles.hit}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Volume"
        >
          <Animated.View pointerEvents="none" style={[styles.cat, cat]}>
            {dragging ? <GestureCat dance="party" size={CAT} /> : null}
          </Animated.View>
          <Animated.View style={[styles.track, track]}>
            <Animated.View style={[styles.fill, fill]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <Volume2 size={14} color="rgba(255,255,255,0.45)" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  hit: { flex: 1, height: 40, justifyContent: "center" },
  track: {
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  fill: { height: "100%", backgroundColor: "#fff" },
  cat: { position: "absolute", left: 0, bottom: 24 },
});
