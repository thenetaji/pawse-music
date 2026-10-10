import * as Application from "expo-application";
import { router } from "expo-router";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight } from "../components/glyphs";
import { RIPPLE } from "../components/ui";
import { Cat, type CatColor } from "../features/cat/cat";
import { useSetting } from "../lib/settings";
import { display } from "../lib/type";

const REPO = "https://github.com/thenetaji/pawse-music";
const LICENSES = [
  ["@rntp/player", "Double Symmetry, personal-use licence"],
  ["Expo and React Native", "MIT"],
  ["Reanimated, Gesture Handler, Skia", "MIT"],
  ["Lyrics", "LRCLIB, Lyrics+, BetterLyrics, Unison, KuGou"],
];

export default function About() {
  const insets = useSafeAreaInsets();
  const color = useSetting<CatColor>("catColor", "orange");
  const version = Application.nativeApplicationVersion ?? "0.1.0";
  const build = Application.nativeBuildVersion ?? "dev";
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#000" }}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 60 }}
    >
      <View style={styles.head}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <Cat mood="groove" size={120} color={color} />
        <Text style={styles.name}>Pawse</Text>
        <Text style={styles.version}>
          Version {version} ({build})
        </Text>
        <Text style={styles.made}>Made with ♥ by thenetaji</Text>
        <Text style={styles.tag}>Free, open source, and a little bit cat.</Text>
      </View>
      <View style={styles.group}>
        <Row
          label="Check for updates"
          onPress={() => void Linking.openURL(`${REPO}/releases`)}
        />
        <Row
          label="Report a bug"
          onPress={() =>
            void Linking.openURL(
              `${REPO}/issues/new?title=${encodeURIComponent(`Pawse ${version} (${build}): `)}`,
            )
          }
        />
        <Row label="Source code" onPress={() => void Linking.openURL(REPO)} />
      </View>
      <Text style={styles.section}>Licences</Text>
      <View style={styles.group}>
        {LICENSES.map(([a, b]) => (
          <View key={a} style={styles.row}>
            <Text style={styles.label}>{a}</Text>
            <Text style={styles.value}>{b}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={RIPPLE}
      style={({ pressed }) => [
        styles.row,
        pressed && !RIPPLE && { backgroundColor: "rgba(255,255,255,0.06)" },
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <ChevronRight size={16} color="rgba(255,255,255,0.35)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  hero: { alignItems: "center", marginTop: 10, marginBottom: 26 },
  name: {
    color: "#fff",
    fontSize: 40,
    ...display("900"),
    letterSpacing: -1.2,
    marginTop: 8,
  },
  version: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  made: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 14,
  },
  tag: { color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 3 },
  section: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    ...display("700"),
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 32,
    marginTop: 28,
    marginBottom: 8,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  label: { color: "#fff", fontSize: 16, flexShrink: 1 },
  value: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    flexShrink: 1,
    textAlign: "right",
  },
});
