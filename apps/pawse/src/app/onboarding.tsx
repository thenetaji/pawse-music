import type { ArtistSummary, SearchResults } from "@pawse/music-core";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Artwork } from "../components/artwork";
import { Chip, PressScale } from "../components/ui";
import { onboardingArtists } from "../data/recommend";
import { Cat, type CatColor } from "../features/cat/cat";
import { yt } from "../lib/engine";
import { haptic } from "../lib/haptics";
import { setSetting, useSetting } from "../lib/settings";
import { display } from "../lib/type";
import { useResource } from "../lib/use-resource";

const COLORS: { id: CatColor; fur: string; label: string }[] = [
  { id: "orange", fur: "#F49A3C", label: "Ginger" },
  { id: "black", fur: "#2E2E36", label: "Midnight" },
  { id: "white", fur: "#F1EEE9", label: "Snow" },
  { id: "grey", fur: "#9AA0AD", label: "Smoke" },
];
const LANGS = [
  "Hindi",
  "English",
  "Punjabi",
  "Tamil",
  "Telugu",
  "Bengali",
  "Marathi",
  "Korean",
  "Spanish",
  "Japanese",
];
const ACCENT = "#8B7CFF";

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const name = useSetting("catName", "Mochi");
  const color = useSetting<CatColor>("catColor", "orange");
  const langs = useSetting<string[]>("seedLanguages", []);
  const artists = useSetting<ArtistSummary[]>("seedArtists", []);
  const region = useSetting("region", "IN");
  const [q, setQ] = useState("");
  const query = q.trim();
  // Popular artists for your region and languages until you search.
  const popular = useResource<ArtistSummary[]>(
    step === 2 && !query ? `onb:popular:${region}:${langs.join(",")}` : null,
    () => onboardingArtists(region, langs),
  );
  const found = useResource<SearchResults>(
    step === 2 && query ? `onb:${query}` : null,
    () => yt.search(query, "artists"),
  );
  const results: ArtistSummary[] = query
    ? (found.data?.items ?? found.data?.shelves.flatMap((s) => s.items) ?? [])
        .filter(
          (i): i is Extract<typeof i, { type: "artist" }> =>
            i.type === "artist",
        )
        .slice(0, 18)
    : (popular.data ?? []);
  // Picks stay in view while the list below changes.
  const shown = [
    ...artists,
    ...results.filter((a) => !artists.some((x) => x.id === a.id)),
  ];

  const finish = () => {
    setSetting("onboarded", true);
    haptic.success();
    // Pushed over (tabs); replacing with "/" would stack a second copy of the tabs.
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const next = () => {
    haptic.light();
    if (step < 3) setStep(step + 1);
    else finish();
  };
  const toggleArtist = (a: ArtistSummary) => {
    haptic.tick();
    setSetting(
      "seedArtists",
      artists.some((x) => x.id === a.id)
        ? artists.filter((x) => x.id !== a.id)
        : [...artists, a],
    );
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
        ))}
      </View>

      <Animated.View
        key={step}
        entering={FadeInDown.duration(380)}
        exiting={FadeOut.duration(150)}
        style={{ flex: 1 }}
      >
        {step === 0 ? (
          <View style={styles.center}>
            <Cat mood="excited" size={170} color={color} />
            <Text style={styles.title}>Meet your cat</Text>
            <Text style={styles.sub}>
              It lives on your progress bar and in the Dynamic Island, and
              dances to everything you play.
            </Text>
            <TextInput
              value={name}
              onChangeText={(v) => setSetting("catName", v.slice(0, 18))}
              style={styles.nameInput}
              placeholder="Give it a name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              selectionColor={ACCENT}
              textAlign="center"
            />
            <View style={styles.colors}>
              {COLORS.map((c) => (
                <PressScale
                  key={c.id}
                  onPress={() => setSetting("catColor", c.id)}
                  style={styles.colorItem}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: c.fur },
                      color === c.id && styles.swatchOn,
                    ]}
                  />
                  <Text
                    style={[
                      styles.colorLabel,
                      color === c.id && { color: "#fff" },
                    ]}
                  >
                    {c.label}
                  </Text>
                </PressScale>
              ))}
            </View>
          </View>
        ) : step === 1 ? (
          <View style={styles.pad}>
            <Text style={styles.title}>What do you listen to?</Text>
            <Text style={styles.sub}>
              Pick any languages. {name} will start there.
            </Text>
            <View style={styles.wrap}>
              {LANGS.map((l) => (
                <Chip
                  key={l}
                  label={l}
                  on={langs.includes(l)}
                  accent={ACCENT}
                  onPress={() =>
                    setSetting(
                      "seedLanguages",
                      langs.includes(l)
                        ? langs.filter((x) => x !== l)
                        : [...langs, l],
                    )
                  }
                />
              ))}
            </View>
          </View>
        ) : step === 2 ? (
          <View style={{ flex: 1 }}>
            <View style={styles.pad}>
              <Text style={styles.title}>A few favourites</Text>
              <Text style={styles.sub}>
                Pick three or more. Your Home and mixes start from them.
              </Text>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search artists"
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.search}
                selectionColor={ACCENT}
              />
            </View>
            <ScrollView contentContainerStyle={styles.artists}>
              {shown.map((a, i) => {
                const on = artists.some((x) => x.id === a.id);
                return (
                  <Animated.View
                    key={a.id}
                    entering={FadeIn.delay(i * 30)}
                    style={styles.artist}
                  >
                    <PressScale
                      onPress={() => toggleArtist(a)}
                      style={{ alignItems: "center" }}
                    >
                      <View
                        style={[styles.ring, on && { borderColor: ACCENT }]}
                      >
                        <Artwork thumbnails={a.thumbnails} size={92} round />
                      </View>
                      <Text
                        style={[styles.artistName, on && { color: "#fff" }]}
                        numberOfLines={1}
                      >
                        {a.name}
                      </Text>
                    </PressScale>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.center}>
            <Cat mood="happy" size={160} color={color} />
            <Text style={styles.title}>All set</Text>
            <Text style={styles.sub}>
              Sign in to YouTube Music for your own feed and likes, or skip and
              start listening.
            </Text>
            <PressScale
              onPress={() => {
                setSetting("onboarded", true);
                router.replace("/sign-in");
              }}
              style={[
                styles.cta,
                { backgroundColor: "rgba(255,255,255,0.14)", marginTop: 28 },
              ]}
            >
              <Text style={[styles.ctaText, { color: "#fff" }]}>
                Sign in to YouTube Music
              </Text>
            </PressScale>
            <PressScale
              onPress={() => {
                setSetting("onboarded", true);
                router.replace("/import");
              }}
              style={[
                styles.cta,
                { backgroundColor: "rgba(255,255,255,0.08)", marginTop: 10 },
              ]}
            >
              <Text style={[styles.ctaText, { color: "#fff" }]}>
                Import from Apple Music or a file
              </Text>
            </PressScale>
          </View>
        )}
      </Animated.View>

      <PressScale onPress={next} style={[styles.cta, { marginHorizontal: 24 }]}>
        <Text style={styles.ctaText}>
          {step === 3
            ? "Start listening"
            : step === 2 && !artists.length
              ? "Skip"
              : "Continue"}
        </Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotOn: { width: 22, backgroundColor: "#fff" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  pad: { paddingHorizontal: 24, paddingTop: 30 },
  title: {
    color: "#fff",
    fontSize: 32,
    ...display("900"),
    letterSpacing: -0.9,
    marginTop: 14,
    textAlign: "center",
  },
  sub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  nameInput: {
    paddingHorizontal: 20,
    marginTop: 26,
    alignSelf: "stretch",
    height: 56,
    borderRadius: 16,
    color: "#fff",
    fontSize: 24,
    ...display("800"),
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  colors: { flexDirection: "row", gap: 18, marginTop: 22 },
  colorItem: { alignItems: "center", gap: 6 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "transparent",
  },
  swatchOn: { borderColor: "#fff" },
  colorLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "600",
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 26,
    justifyContent: "center",
  },
  search: {
    marginTop: 18,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: "#fff",
    fontSize: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  artists: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 20,
  },
  artist: { width: "33.33%", alignItems: "center", marginBottom: 18 },
  ring: {
    borderRadius: 50,
    borderWidth: 3,
    borderColor: "transparent",
    padding: 2,
  },
  artistName: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
    maxWidth: 100,
  },
  cta: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    alignSelf: "stretch",
  },
  ctaText: { color: "#000", fontSize: 17, ...display("800") },
});
