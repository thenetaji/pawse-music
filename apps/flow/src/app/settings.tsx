import { player } from "@studio/player";
import { router } from "expo-router";
import type { ReactNode } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { FlowIsland } from "../../modules/flow-island-android";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showSheet } from "../components/action-sheet";
import { PressScale } from "../components/ui";
import { useLibrary } from "../data/library";
import { haptic } from "../lib/haptics";
import { setSetting, useSetting } from "../lib/settings";
import { Cat, type CatColor } from "../features/cat/cat";
import { useAccent } from "../features/now-playing/now-palette";

const CAT_COLORS: { id: CatColor; fur: string }[] = [
  { id: "orange", fur: "#F49A3C" },
  { id: "black", fur: "#2E2E36" },
  { id: "white", fur: "#F1EEE9" },
  { id: "grey", fur: "#9AA0AD" },
];
const ACCENTS = [
  "#8B7CFF",
  "#FF5A7A",
  "#FF9F43",
  "#2ED3A2",
  "#38B6FF",
  "#F5D547",
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const accountName = useLibrary((s) => s.settings.accountName);
  const catName = useSetting("catName", "Mochi");
  const catColor = useSetting<CatColor>("catColor", "orange");

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 80 }}
    >
      <View style={styles.head}>
        <Text style={styles.h1}>Settings</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.catCard}>
        <Cat mood="groove" size={84} color={catColor} />
        <View style={{ flex: 1 }}>
          <Text style={styles.catKicker}>Your cat</Text>
          <TextInput
            value={catName}
            onChangeText={(v) => setSetting("catName", v.slice(0, 18))}
            style={styles.catName}
            placeholder="Name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            selectionColor={accent}
          />
          <View style={styles.swatches}>
            {CAT_COLORS.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  haptic.tick();
                  setSetting("catColor", c.id);
                }}
                style={[
                  styles.swatch,
                  { backgroundColor: c.fur },
                  catColor === c.id && { borderColor: accent },
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <Section title="YouTube Music">
        {signedIn ? (
          <>
            <Info label="Signed in" value={accountName ?? "YouTube Music"} />
            <Toggle k="syncLikes" label="Sync likes to YouTube" def />
            <Toggle k="reportPlays" label="Send plays to YouTube history" def />
            <Link
              label="Import my YouTube Music library"
              onPress={() => router.push("/import")}
            />
            <Link
              label="Sign out"
              danger
              onPress={() =>
                useLibrary
                  .getState()
                  .setSettings({ cookies: null, accountName: null })
              }
            />
          </>
        ) : (
          <Link
            label="Sign in for your feed and likes"
            tint={accent}
            onPress={() => router.push("/sign-in")}
          />
        )}
      </Section>
      <Foot>
        Signing in only personalises home, likes and playlists. Music always
        streams signed out.
      </Foot>

      <Section title="Playback">
        <Pick
          k="quality"
          label="Audio quality"
          def="high"
          options={[
            ["high", "High"],
            ["normal", "Normal"],
            ["saver", "Data saver"],
          ]}
        />
        <Toggle k="preferSaavn" label="Prefer JioSaavn 320 kbps" def={false} />
        <Toggle
          k="normalize"
          label="Same loudness for every song"
          def
          onChange={(v) => player.setNormalize(v)}
        />
        <Toggle k="radioContinue" label="Keep playing similar songs" def />
        <Toggle k="resume" label="Resume where I left off" def />
        <Toggle
          k="pauseOnDisconnect"
          label="Pause when headphones disconnect"
          def
        />
        <Pick
          k="sleepFade"
          label="Sleep timer fade-out"
          def={10}
          options={[
            [0, "Off"],
            [5, "5 s"],
            [10, "10 s"],
            [30, "30 s"],
          ]}
        />
      </Section>

      <Section title="Downloads and storage">
        <Pick
          k="downloadQuality"
          label="Download quality"
          def="high"
          options={[
            ["high", "High"],
            ["normal", "Normal"],
          ]}
        />
        <Toggle k="wifiOnly" label="Download on Wi-Fi only" def={false} />
        <Toggle
          k="autoDownloadLiked"
          label="Download songs I like"
          def={false}
        />
        <Pick
          k="cacheLimitMb"
          label="Cache size"
          def={500}
          options={[
            [250, "250 MB"],
            [500, "500 MB"],
            [1000, "1 GB"],
            [4000, "4 GB"],
          ]}
        />
        <Link
          label="Manage downloads"
          onPress={() => router.push("/downloads")}
        />
      </Section>

      <Section title="Lyrics">
        <Toggle k="lyricsLine" label="Show the live line on Now Playing" def />
        <Pick
          k="lyricsSize"
          label="Text size"
          def="m"
          options={[
            ["s", "Small"],
            ["m", "Medium"],
            ["l", "Large"],
          ]}
        />
      </Section>

      <Section title="Appearance">
        <Pick
          k="accentMode"
          label="Accent colour"
          def="artwork"
          options={[
            ["artwork", "From the artwork"],
            ["fixed", "Fixed"],
          ]}
        />
        <AccentRow />
        <Pick
          k="npBackground"
          label="Now Playing background"
          def="field"
          options={[
            ["field", "Colour field"],
            ["blur", "Blurred artwork"],
            ["black", "Pure black"],
          ]}
        />
        <Toggle k="reduceMotion" label="Reduce motion" def={false} />
      </Section>

      <Section title="Cat">
        <Toggle k="catWire" label={`${catName} on the progress bar`} def />
        <Toggle k="catIsland" label={`${catName} in the Dynamic Island`} def />
        <Pick
          k="catEpisodes"
          label="Mouse episodes"
          def="rare"
          options={[
            ["off", "Off"],
            ["rare", "Now and then"],
            ["often", "Often"],
          ]}
        />
      </Section>

      <Section title="Content">
        <Pick
          k="region"
          label="Region"
          def="IN"
          options={[
            ["IN", "India"],
            ["US", "United States"],
            ["GB", "United Kingdom"],
            ["ZZ", "Global"],
          ]}
        />
        <Pick
          k="language"
          label="Feed language"
          def="en"
          options={[
            ["en", "English"],
            ["hi", "Hindi"],
          ]}
        />
        <Toggle k="explicitFilter" label="Hide explicit songs" def={false} />
      </Section>

      <Section title="Privacy">
        <Toggle k="pauseHistory" label="Pause listening history" def={false} />
        <Link
          label="Clear search history"
          onPress={() => useLibrary.getState().clearSearches()}
        />
        <Link
          label="Clear listening history"
          danger
          onPress={() =>
            showSheet({
              actions: [
                {
                  label: "Clear listening history",
                  destructive: true,
                  onPress: () => useLibrary.setState({ history: [] }),
                },
              ],
            })
          }
        />
      </Section>

      {Platform.OS === "android" ? (
        <Section title="Android">
          <Toggle
            k="androidPill"
            label={`${catName} pill around the camera`}
            def={false}
            onChange={(v) => {
              if (v && !FlowIsland.hasOverlayPermission())
                FlowIsland.requestOverlayPermission();
            }}
          />
          <Pick
            k="androidPillOffset"
            label="Pill position"
            def={0}
            options={[
              [-6, "Higher"],
              [0, "Centred on camera"],
              [6, "Lower"],
            ]}
          />
          {FlowIsland.needsBatteryTip() ? (
            <Link
              label="Keep Flow running (battery settings)"
              onPress={() => FlowIsland.openBatterySettings()}
            />
          ) : null}
        </Section>
      ) : null}

      <Section title="Backup">
        <Link
          label="Export library"
          onPress={() =>
            void import("../data/backup")
              .then((m) => m.exportLibrary())
              .catch((e: Error) => Alert.alert("Export failed", e.message))
          }
        />
        <Link
          label="Import library"
          onPress={() =>
            void import("../data/backup")
              .then((m) => m.importLibrary())
              .then(
                (r) =>
                  r &&
                  Alert.alert(
                    "Library imported",
                    `${r.liked} likes, ${r.playlists} playlists, ${r.plays} plays`,
                  ),
              )
              .catch((e: Error) => Alert.alert("Import failed", e.message))
          }
        />
      </Section>

      <Section title="About">
        <Link label="About Flow" onPress={() => router.push("/about")} />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const Foot = ({ children }: { children: ReactNode }) => (
  <Text style={styles.foot}>{children}</Text>
);

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Toggle({
  k,
  label,
  def,
  onChange,
}: {
  k: string;
  label: string;
  def: boolean;
  onChange?: (v: boolean) => void;
}) {
  const value = useSetting(k, def);
  const accent = useAccent();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.tick();
          setSetting(k, v);
          onChange?.(v);
        }}
        trackColor={{ true: accent, false: "rgba(255,255,255,0.2)" }}
      />
    </View>
  );
}

function Pick<T extends string | number>({
  k,
  label,
  def,
  options,
}: {
  k: string;
  label: string;
  def: T;
  options: [T, string][];
}) {
  const value = useSetting<T>(k, def);
  const shown = options.find(([v]) => v === value)?.[1] ?? "";
  return (
    <Pressable
      onPress={() =>
        showSheet({
          actions: options.map(([v, l]) => ({
            label: v === value ? `✓  ${l}` : l,
            onPress: () => setSetting(k, v),
          })),
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Text style={styles.value}>{shown} ›</Text>
    </Pressable>
  );
}

function Link({
  label,
  onPress,
  danger,
  tint,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text
        style={[
          styles.label,
          danger && { color: "#FF5A6A" },
          tint ? { color: tint } : null,
        ]}
      >
        {label}
      </Text>
      {!danger && !tint ? <Text style={styles.value}>›</Text> : null}
    </Pressable>
  );
}

function AccentRow() {
  const mode = useSetting<string>("accentMode", "artwork");
  const color = useSetting("accentColor", "#8B7CFF");
  if (mode !== "fixed") return null;
  return (
    <View style={[styles.row, { gap: 12, justifyContent: "flex-start" }]}>
      {ACCENTS.map((c) => (
        <PressScale
          key={c}
          onPress={() => setSetting("accentColor", c)}
          style={[
            styles.accent,
            { backgroundColor: c },
            color === c && styles.accentOn,
          ]}
        >
          <View />
        </PressScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  h1: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  catKicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  catName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    paddingVertical: 2,
  },
  swatches: { flexDirection: "row", gap: 10, marginTop: 6 },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
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
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  label: { color: "#fff", fontSize: 16 },
  value: { color: "rgba(255,255,255,0.5)", fontSize: 16 },
  foot: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    paddingHorizontal: 32,
    marginTop: 8,
    lineHeight: 18,
  },
  accent: { width: 30, height: 30, borderRadius: 15 },
  accentOn: { borderWidth: 3, borderColor: "#fff" },
});
