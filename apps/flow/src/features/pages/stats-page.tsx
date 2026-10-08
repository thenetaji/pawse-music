import { getSetting } from "../../lib/settings";
import { player } from "@studio/player";
import { useRef, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { Artwork } from "../../components/artwork";
import { Chip, PressScale } from "../../components/ui";
import { listeningStats, useLibrary } from "../../data/library";
import { useSetting } from "../../lib/settings";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent, useNowPalette } from "../now-playing/now-palette";
import { useArtworkPalette } from "../now-playing/use-artwork-palette";
import { bestThumbnail } from "@studio/music-core";
import { BackButton } from "./collection";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "This year", days: 365 },
  { label: "All time", days: 36500 },
];

export default function StatsPage() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const nowPalette = useNowPalette((s) => s.palette);
  const color = useSetting<CatColor>("catColor", "orange");
  const name = useSetting("catName", "Mochi");
  const history = useLibrary((s) => s.history);
  const [r, setR] = useState(0);
  const [now] = useState(() => Date.now());
  const card = useRef<View>(null);
  const stats = listeningStats(
    history,
    now - RANGES[r].days * 86400_000,
    now,
    10,
  );
  const topArt = useArtworkPalette(
    stats.topSongs[0]
      ? bestThumbnail(stats.topSongs[0].track.thumbnails, 120)
      : undefined,
  );
  const palette = stats.topSongs.length ? topArt : nowPalette;
  const has = stats.plays > 0;

  const share = async () => {
    try {
      const uri = await captureRef(card, { format: "png", quality: 1 });
      await Share.share({
        url: uri,
        message: `My ${RANGES[r].label.toLowerCase()} on Flow`,
      });
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 52,
          paddingBottom: 140,
        }}
      >
        <Text style={styles.h1}>Your music</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {RANGES.map((x, i) => (
            <Chip
              key={x.label}
              label={x.label}
              on={i === r}
              accent={accent}
              onPress={() => setR(i)}
            />
          ))}
        </ScrollView>

        <View
          ref={card}
          collapsable={false}
          style={[styles.card, { backgroundColor: palette.colors[0] }]}
        >
          <View style={[styles.glow, { backgroundColor: palette.colors[1] }]} />
          <Text style={styles.cardKicker}>Flow · {RANGES[r].label}</Text>
          <Text style={styles.cardBig}>
            {Math.round(stats.minutes).toLocaleString()}
          </Text>
          <Text style={styles.cardUnit}>minutes of music</Text>
          <View style={styles.cardRow}>
            <Cat
              mood={stats.plays ? "happy" : "sleep"}
              size={72}
              color={color}
            />
            <Text style={styles.cardLine}>
              {stats.topArtists[0]
                ? `${name}'s pick: ${stats.topArtists[0].artist.name}`
                : `${name} is waiting for music.`}
            </Text>
          </View>
          {stats.topSongs.slice(0, 3).map((s, i) => (
            <View key={s.track.id} style={styles.cardSong}>
              <Text style={styles.cardRank}>{i + 1}</Text>
              <Artwork thumbnails={s.track.thumbnails} size={40} radius={6} />
              <Text style={styles.cardSongText} numberOfLines={1}>
                {s.track.title}
              </Text>
            </View>
          ))}
        </View>
        {has ? (
          <PressScale onPress={share} style={styles.share}>
            <Text style={styles.shareText}>Share card</Text>
          </PressScale>
        ) : null}

        {has ? <Text style={styles.section}>Top songs</Text> : null}
        {stats.topSongs.map((s, i) => (
          <Animated.View key={s.track.id} entering={FadeInDown.delay(i * 30)}>
            <PressScale
              onPress={() =>
                void player.play(
                  stats.topSongs.map((x) => x.track),
                  i,
                  {
                    radio: getSetting("radioContinue", true),
                    source: { type: "library", title: "Your top songs" },
                  },
                )
              }
              scaleTo={0.98}
              style={styles.row}
            >
              <Text style={[styles.rank, i < 3 && { color: accent }]}>
                {i + 1}
              </Text>
              <Artwork thumbnails={s.track.thumbnails} size={48} radius={7} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {s.track.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {s.plays} plays · {Math.round(s.minutes)} min
                </Text>
              </View>
            </PressScale>
          </Animated.View>
        ))}
        {has ? <Text style={styles.section}>Top artists</Text> : null}
        {stats.topArtists.map((a, i) => (
          <View key={a.artist.name} style={styles.row}>
            <Text style={[styles.rank, i < 3 && { color: accent }]}>
              {i + 1}
            </Text>
            <Artwork thumbnails={a.track.thumbnails} size={48} round />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                {a.artist.name}
              </Text>
              <Text style={styles.sub}>
                {a.plays} plays · {Math.round(a.minutes)} min
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <BackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  h1: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    paddingHorizontal: 20,
  },
  chips: { gap: 8, paddingHorizontal: 20, marginTop: 12 },
  card: {
    marginHorizontal: 16,
    marginTop: 18,
    borderRadius: 28,
    padding: 22,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    right: -80,
    top: -80,
    opacity: 0.8,
  },
  cardKicker: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  cardBig: {
    color: "#fff",
    fontSize: 64,
    fontWeight: "900",
    letterSpacing: -2.5,
    marginTop: 6,
  },
  cardUnit: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "700",
    marginTop: -4,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
  },
  cardLine: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700" },
  cardSong: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  cardRank: {
    width: 16,
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontWeight: "900",
  },
  cardSongText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  share: {
    alignSelf: "center",
    marginTop: 14,
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  shareText: { color: "#000", fontSize: 15, fontWeight: "800" },
  section: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    paddingHorizontal: 20,
    marginTop: 30,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  rank: {
    width: 22,
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
});
