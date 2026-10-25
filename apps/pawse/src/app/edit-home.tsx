import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Foot, Link, Section } from "../components/settings-rows";
import { Screen } from "../components/ui";
import { useAccent } from "../features/now-playing/now-palette";
import { haptic } from "../lib/haptics";
import {
  HOME_SECTIONS,
  type HomeSection,
  resetHomeSections,
  setHomeSections,
  useHomeSections,
} from "../lib/home-sections";
import { useSetting } from "../lib/settings";

/** Home's sections: switch each on or off and move them up or down. */
export default function EditHome() {
  const list = useHomeSections();
  const videos = useSetting("videos", true);
  const accent = useAccent();
  const shown = list.filter(
    (s) => videos || !HOME_SECTIONS.find((d) => d.id === s.id)?.videos,
  );
  const move = (s: HomeSection, by: -1 | 1) => {
    const i = shown.indexOf(s);
    const other = shown[i + by];
    if (!other) return;
    haptic.tick();
    const next = [...list];
    next[list.indexOf(s)] = other;
    next[list.indexOf(other)] = s;
    setHomeSections(next);
  };
  const toggle = (s: HomeSection, on: boolean) => {
    haptic.tick();
    setHomeSections(list.map((x) => (x.id === s.id ? { ...x, on } : x)));
  };
  return (
    <Screen title="Edit Home" back bottomInset={60}>
      <Section title="Sections">
        {shown.map((s, i) => {
          const d = HOME_SECTIONS.find((x) => x.id === s.id)!;
          return (
            <View key={s.id} style={styles.row}>
              <View style={styles.arrows}>
                <Arrow up disabled={i === 0} onPress={() => move(s, -1)} />
                <Arrow
                  disabled={i === shown.length - 1}
                  onPress={() => move(s, 1)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, !s.on && styles.off]}>
                  {d.label}
                </Text>
                <Text style={styles.note} numberOfLines={1}>
                  {d.note}
                </Text>
              </View>
              <Switch
                value={s.on}
                onValueChange={(v) => toggle(s, v)}
                trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
                thumbColor="#fff"
              />
            </View>
          );
        })}
      </Section>
      <Foot>
        With the YouTube suggestions off, Home shows what you follow and play,
        then ends. Turn on YouTube Music picks for a feed that keeps going.
      </Foot>
      <Section title="Start over">
        <Link label="Reset Home" onPress={resetHomeSections} />
      </Section>
    </Screen>
  );
}

function Arrow({
  up,
  disabled,
  onPress,
}: {
  up?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={up ? "Move up" : "Move down"}
      style={[styles.arrow, disabled && { opacity: 0.25 }]}
    >
      <Svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  arrows: { gap: 2 },
  arrow: {
    width: 28,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  label: { color: "#fff", fontSize: 16 },
  off: { color: "rgba(255,255,255,0.45)" },
  note: { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 2 },
});
