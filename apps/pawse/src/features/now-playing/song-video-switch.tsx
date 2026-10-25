import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";

const W = 62;

/** YouTube Music's Song | Video switch: what fills the top of the player. */
export function SongVideoSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(on ? W : 0, { duration: 220 }) }],
  }));
  const pick = (v: boolean) => () => {
    if (v === on) return;
    haptic.light();
    onChange(v);
  };
  return (
    <View style={styles.track} accessibilityRole="tablist">
      <Animated.View style={[styles.knob, knob]} />
      {(["Song", "Video"] as const).map((label, i) => {
        const sel = (i === 1) === on;
        return (
          <Pressable
            key={label}
            onPress={pick(i === 1)}
            style={styles.seg}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
          >
            <Text style={[styles.label, sel && styles.labelOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark glass, so it sits quietly on any artwork instead of a white bar across faces.
  track: {
    flexDirection: "row",
    padding: 2,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  knob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: W,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  seg: { width: W, height: 26, alignItems: "center", justifyContent: "center" },
  label: { color: "rgba(255,255,255,0.85)", fontSize: 13, ...display("700") },
  labelOn: { color: "#000" },
});
