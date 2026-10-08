import { player } from "@studio/player";
import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "../data/library";
import { useAccent } from "../features/now-playing/now-palette";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { settings, setSettings } = useLibrary();
  const signedIn = !!settings.cookies;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#000" }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 60 }}
    >
      <View style={styles.head}>
        <Text style={styles.h1}>Settings</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>YouTube Music</Text>
      <View style={styles.group}>
        {signedIn ? (
          <>
            <Row label="Signed in" value={settings.accountName ?? ""} />
            <Toggle
              label="Send plays to YouTube history"
              value={settings.reportPlays}
              accent={accent}
              onChange={(v) => setSettings({ reportPlays: v })}
            />
            <Pressable
              onPress={() => setSettings({ cookies: null, accountName: null })}
              style={styles.row}
            >
              <Text style={[styles.label, { color: "#FF5A6A" }]}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => router.push("/sign-in")} style={styles.row}>
            <Text style={[styles.label, { color: accent }]}>
              Sign in for your feed and likes
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.foot}>
        Signing in only personalises home, likes and playlists. Music always
        streams signed out.
      </Text>

      <Text style={styles.section}>Playback</Text>
      <View style={styles.group}>
        <Toggle
          label="Same loudness for every song"
          value={settings.normalize}
          accent={accent}
          onChange={(v) => {
            setSettings({ normalize: v });
            player.setNormalize(v);
          }}
        />
        <Toggle
          label="Prefer JioSaavn 320 kbps"
          value={settings.preferSaavn}
          accent={accent}
          onChange={(v) => setSettings({ preferSaavn: v })}
        />
      </View>
      <Text style={styles.foot}>
        With JioSaavn on, songs that match closely play in 320 kbps; everything
        else stays on YouTube.
      </Text>

      <Text style={styles.section}>About</Text>
      <View style={styles.group}>
        <Row label="Flow" value="0.1.0" />
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Toggle({
  label,
  value,
  accent,
  onChange,
}: {
  label: string;
  value: boolean;
  accent: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  h1: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  section: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "700",
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
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  label: { color: "#fff", fontSize: 16 },
  value: { color: "rgba(255,255,255,0.5)", fontSize: 16 },
  foot: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    paddingHorizontal: 32,
    marginTop: 8,
    lineHeight: 18,
  },
});
