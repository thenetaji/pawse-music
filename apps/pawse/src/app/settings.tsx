import { player } from "@pawse/player";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlowIsland } from "../../modules/flow-island-android";
import { showSheet } from "../components/action-sheet";
import {
  Foot,
  Info,
  Link,
  Pick,
  Section,
  Toggle,
} from "../components/settings-rows";
import { PressScale } from "../components/ui";
import { useLibrary } from "../data/library";
import { signOut } from "../features/account/sign-out";
import { Cat, type CatColor } from "../features/cat/cat";
import { useAccent } from "../features/now-playing/now-palette";
import { clearLog, getLogText, useLogCount } from "../lib/diagnostics";
import { yt } from "../lib/engine";
import { haptic } from "../lib/haptics";
import {
  LANGUAGES,
  languageCode,
  languageName,
  REGIONS,
  regionCode,
  regionName,
} from "../lib/locale";
import { push } from "../lib/nav";
import { count } from "../lib/plural";
import { useAutoQuality } from "../lib/quality";
import { setSetting, useSetting } from "../lib/settings";
import { display } from "../lib/type";
import {
  checkForUpdate,
  currentVersion,
  installUpdate,
  useUpdate,
} from "../lib/updates";
import { useResource } from "../lib/use-resource";

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
            <AccountRow fallback={accountName} />
            <Toggle k="syncLikes" label="Sync likes to YouTube" def />
            <Toggle k="reportPlays" label="Send plays to YouTube history" def />
            <Link
              label="Import my YouTube Music library"
              onPress={() => push("/import")}
            />
            <Link label="Sign out" danger onPress={() => void signOut()} />
          </>
        ) : (
          <Link
            label="Sign in for your feed and likes"
            tint={accent}
            onPress={() => push("/sign-in")}
          />
        )}
      </Section>
      <Foot>
        Signing in only personalises home, likes and playlists. Music always
        streams signed out.
      </Foot>

      <Section title="Playback">
        <QualityRow k="quality" label="Wi-Fi streaming" network="wifi" />
        <QualityRow
          k="qualityCellular"
          label="Mobile data streaming"
          network="cellular"
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

      <Foot>
        Automatic plays High on Wi-Fi, 5G and 4G, and Low on slower connections
        or when songs keep stalling. Low on mobile data also loads smaller
        artwork, keeps no songs offline and prepares only the next song.
        Downloads and offline songs live in Library.
      </Foot>

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
          def="auto"
          options={[
            ["auto", `Automatic (${regionName(regionCode("auto"))})`],
            ["ZZ", "Worldwide"],
            ...REGIONS,
          ]}
        />
        <Pick
          k="language"
          label="Feed language"
          def="auto"
          options={[
            ["auto", `Automatic (${languageName(languageCode("auto"))})`],
            ...LANGUAGES,
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
              label="Keep Pawse running (battery settings)"
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
                    `${count(r.liked, "like")}, ${count(r.playlists, "playlist")}, ${count(r.plays, "play")}`,
                  ),
              )
              .catch((e: Error) => Alert.alert("Import failed", e.message))
          }
        />
      </Section>

      <Section title="About">
        <Link label="About Pawse" onPress={() => push("/about")} />
        {Platform.OS !== "web" ? <UpdateRow tint={accent} /> : null}
        <DiagnosticsRow />
        <Link
          label="Show onboarding again"
          onPress={() => {
            setSetting("onboarded", false);
            push("/onboarding");
          }}
        />
      </Section>
    </ScrollView>
  );
}

// Checks GitHub Releases; Android installs the APK itself, iOS hands the IPA to SideStore.
function UpdateRow({ tint }: { tint: string }) {
  const st = useUpdate();
  const busy = st.kind === "checking" || st.kind === "downloading";
  const label =
    st.kind === "available"
      ? `Update to ${st.update.version}`
      : st.kind === "downloading"
        ? `Downloading ${st.update.version}…`
        : "Check for updates";
  const value =
    st.kind === "checking"
      ? "Checking…"
      : st.kind === "current"
        ? "Up to date"
        : st.kind === "downloading"
          ? `${Math.round(st.progress * 100)}%`
          : st.kind === "error"
            ? "Couldn’t check"
            : currentVersion();
  return (
    <Pressable
      disabled={busy}
      onPress={() =>
        st.kind === "available"
          ? void installUpdate(st.update)
          : void checkForUpdate()
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {st.kind === "downloading" ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              width: `${st.progress * 100}%`,
              backgroundColor: tint,
              opacity: 0.2,
            },
          ]}
        />
      ) : null}
      <Text style={[styles.label, st.kind === "available" && { color: tint }]}>
        {label}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );
}

const QUALITY_LABEL = { auto: "Automatic", high: "High", saver: "Low" };

// Automatic shows what it is choosing on that network right now.
function QualityRow({
  k,
  label,
  network,
}: {
  k: "quality" | "qualityCellular";
  label: string;
  network: "wifi" | "cellular";
}) {
  const raw = useSetting<string>(k, "auto");
  const value = raw === "saver" || raw === "high" ? raw : "auto";
  const now = useAutoQuality()[network];
  const shown =
    value === "auto"
      ? `Automatic · ${now === "saver" ? "Low" : "High"}`
      : QUALITY_LABEL[value];
  const options: ["auto" | "high" | "saver", string][] = [
    ["auto", "Automatic (recommended)"],
    ["high", "High"],
    ["saver", "Low · saves data"],
  ];
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

// Copies the playback log so a bug report says what actually happened.
function DiagnosticsRow() {
  const count = useLogCount();
  return (
    <Pressable
      onPress={() =>
        showSheet({
          actions: [
            {
              label: "Copy diagnostics",
              onPress: () =>
                void Clipboard.setStringAsync(getLogText()).then(() =>
                  Alert.alert(
                    "Copied",
                    "Paste it in a message to the developer.",
                  ),
                ),
            },
            { label: "Clear", destructive: true, onPress: clearLog },
          ],
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.label}>Diagnostics</Text>
      <Text style={styles.value}>{count} events ›</Text>
    </Pressable>
  );
}

// Asks YouTube who is signed in, so a rejected session is visible instead of silently doing nothing.
function AccountRow({ fallback }: { fallback: string | null }) {
  const me = useResource("account:me", () => yt.accountInfo());
  if (me.loading) return <Info label="Signed in" value="Checking…" />;
  if (!me.data)
    return (
      <Pressable onPress={() => push("/sign-in")} style={styles.row}>
        <Text style={[styles.label, { color: "#FF9F43", flex: 1 }]}>
          YouTube didn’t accept this sign-in. Tap to sign in again.
        </Text>
      </Pressable>
    );
  return (
    <View style={[styles.row, { gap: 12, justifyContent: "flex-start" }]}>
      {me.data.photo ? (
        <Image
          source={me.data.photo}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{me.data.name ?? fallback}</Text>
        {me.data.handle ? (
          <Text style={[styles.value, { fontSize: 13 }]}>{me.data.handle}</Text>
        ) : null}
      </View>
    </View>
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
  h1: { color: "#fff", fontSize: 34, ...display("800"), letterSpacing: -0.8 },
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
    ...display("700"),
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  catName: {
    color: "#fff",
    fontSize: 24,
    ...display("800"),
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
