import { Image } from "expo-image";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PawseIsland } from "../../../modules/pawse-island-android";
import {
  Foot,
  Link,
  Pick,
  styles as rows,
  Section,
  Toggle,
} from "../../components/settings-rows";
import { PressScale, Screen } from "../../components/ui";
import { Cat, type CatColor } from "../../features/cat/cat";
import { IslandStylePicker } from "../../features/island/island-style-picker";
import { useAccent } from "../../features/now-playing/now-palette";
import {
  APP_ICONS,
  type AppIconId,
  appIconsSupported,
  currentAppIcon,
  setAppIcon,
} from "../../lib/app-icon";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { setSetting, useSetting } from "../../lib/settings";
import { display } from "../../lib/type";

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

export default function LookSettings() {
  const accent = useAccent();
  const catName = useSetting("catName", "Mochi");
  const catColor = useSetting<CatColor>("catColor", "orange");
  const pawseIsland = useSetting("pawseIsland", false);
  const androidPill = useSetting("androidPill", false);

  return (
    <Screen title="Look and Mochi" back bottomInset={60}>
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

      <Section title="Appearance">
        <AppIconRow />
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
        <Toggle
          k="catWire"
          label={`${catName} on the progress bar`}
          tip={`${catName} now rides the progress bar in Now Playing`}
          def
        />
        <Toggle
          k="pawseIsland"
          label={`${catName} in the Dynamic Island`}
          hint="iOS keeps its own music bubble too, so the two sit side by side"
          tip={`${catName} now shows while music plays`}
          def={false}
        />
        <Pick
          k="catEpisodes"
          label="Mouse visits"
          def="rare"
          options={[
            ["off", "Off"],
            ["rare", "Now and then"],
            ["often", "Often"],
          ]}
        />
        <Link label={`${catName}'s wardrobe`} onPress={() => push("/mochi")} />
      </Section>
      {Platform.OS === "ios" && pawseIsland ? (
        <Section title="Dynamic Island">
          <IslandStylePicker catName={catName} />
          <Toggle k="islandRate" label="Like and dislike on the island" def />
          <Toggle
            k="islandMoodLine"
            label={`${catName}'s mood line`}
            def={false}
          />
        </Section>
      ) : null}
      {Platform.OS === "ios" && pawseIsland ? (
        <Foot>
          {`Off, the island shows iOS's own player. On, iOS splits it into ${catName}'s bubble and its own; long-press for ${catName}'s full player.`}
        </Foot>
      ) : null}

      {Platform.OS === "android" ? (
        <Section title="Android">
          <Toggle
            k="androidPill"
            label={`${catName} pill around the camera`}
            tip={`${catName} now shows around the camera while music plays`}
            def={false}
            onChange={(v) => {
              if (v && !PawseIsland.hasOverlayPermission())
                PawseIsland.requestOverlayPermission();
            }}
          />
          {androidPill ? (
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
          ) : null}
          {PawseIsland.needsBatteryTip() ? (
            <Link
              label="Keep playing in the background"
              onPress={() => PawseIsland.openBatterySettings()}
            />
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

function AppIconRow() {
  const [icon, setIcon] = useState<AppIconId>(currentAppIcon);
  const accent = useAccent();
  if (!appIconsSupported) return null;
  return (
    <View style={[rows.row, styles.iconRow]}>
      <Text style={[rows.label, styles.iconLabel]}>App icon</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.icons}
      >
        {APP_ICONS.map((a) => {
          const on = a.id === icon;
          return (
            <PressScale
              key={a.name}
              accessibilityLabel={`${a.name} icon`}
              accessibilityState={{ selected: on }}
              onPress={async () => {
                if (on) return;
                haptic.tick();
                if (await setAppIcon(a.id)) setIcon(a.id);
              }}
              style={styles.iconItem}
            >
              <View style={[styles.iconRing, on && { borderColor: accent }]}>
                <Image source={a.preview} style={styles.iconImg} />
              </View>
              <Text
                style={[styles.iconName, on && { color: "#fff" }]}
                numberOfLines={1}
              >
                {a.name}
              </Text>
            </PressScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AccentRow() {
  const mode = useSetting<string>("accentMode", "artwork");
  const color = useSetting("accentColor", "#8B7CFF");
  if (mode !== "fixed") return null;
  return (
    <View style={[rows.row, { gap: 12, justifyContent: "flex-start" }]}>
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
  iconRow: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 0,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  iconLabel: { paddingHorizontal: 16 },
  icons: { paddingHorizontal: 16, gap: 14 },
  iconItem: { alignItems: "center", gap: 6, width: 66 },
  iconRing: {
    padding: 3,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconImg: { width: 56, height: 56, borderRadius: 13 },
  iconName: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 8,
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
  accent: { width: 30, height: 30, borderRadius: 15 },
  accentOn: { borderWidth: 3, borderColor: "#fff" },
});
