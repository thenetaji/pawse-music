import type { PlaylistSummary } from "@studio/music-core";
import { player } from "@studio/player";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Artwork } from "../../components/artwork";
import { useBottomSpace, useTabRoot } from "../../components/page";
import { topTracks, useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { go } from "../../lib/nav";
import { useResource } from "../../lib/use-resource";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

const RANGES = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "All time", days: 36500 },
];

export default function LibraryPage() {
  useTabRoot("library");
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const accent = useAccent();
  const { liked, playlists, history, settings } = useLibrary();
  const [range, setRange] = useState(1);
  const signedIn = !!settings.cookies;
  const ytPlaylists = useResource<PlaylistSummary[]>(
    signedIn ? "lib:playlists" : null,
    () => yt.libraryPlaylists(),
  );
  const top = topTracks(history, RANGES[range].days, 10);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <TopGlow height={360} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: bottom,
        }}
      >
        <View style={styles.headRow}>
          <Text style={styles.h1}>Library</Text>
          <Pressable
            hitSlop={10}
            onPress={() => router.push("/settings")}
            style={styles.gear}
          >
            <Text style={styles.gearText}>Settings</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => go("/playlist/liked")}
          style={({ pressed }) => [
            styles.liked,
            { backgroundColor: accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.likedTitle}>Liked songs</Text>
          <Text style={styles.likedSub}>{liked.length} songs</Text>
        </Pressable>

        <Text style={styles.section}>Playlists</Text>
        {playlists.map((p) => (
          <Row
            key={p.id}
            title={p.title}
            sub={`${p.tracks.length} songs`}
            thumbs={p.tracks[0]?.thumbnails}
            onPress={() => go(`/playlist/${p.id}`)}
          />
        ))}
        {(ytPlaylists.data ?? []).map((p) => (
          <Row
            key={p.id}
            title={p.title}
            sub={[
              "YouTube Music",
              p.trackCount ? `${p.trackCount} songs` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            thumbs={p.thumbnails}
            onPress={() => go(`/playlist/${p.id}`)}
          />
        ))}
        {!playlists.length && !ytPlaylists.data?.length ? (
          <Text style={styles.hint}>
            {signedIn
              ? "Make one from any song’s menu."
              : "Sign in from Settings to bring your YouTube Music playlists."}
          </Text>
        ) : null}

        <View style={styles.statsHead}>
          <Text style={[styles.section, { marginTop: 0 }]}>Most played</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ranges}
        >
          {RANGES.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={() => setRange(i)}
              style={[styles.range, i === range && { backgroundColor: accent }]}
            >
              <Text
                style={[styles.rangeText, i === range && { color: "#000" }]}
              >
                {r.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {top.length ? (
          top.map((t, i) => (
            <Pressable
              key={t.track.id}
              onPress={() =>
                void player.play(
                  top.map((x) => x.track),
                  i,
                  {
                    radio: true,
                    source: { type: "library", title: "Most played" },
                  },
                )
              }
              style={({ pressed }) => [
                styles.topRow,
                pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
              ]}
            >
              <Text style={[styles.rank, i < 3 && { color: accent }]}>
                {i + 1}
              </Text>
              <Artwork thumbnails={t.track.thumbnails} size={46} radius={7} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {t.track.title}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {t.track.artists.map((a) => a.name).join(", ")}
                </Text>
              </View>
              <Text style={styles.plays}>{t.plays}×</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.hint}>Nothing yet. Play something.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function Row({
  title,
  sub,
  thumbs,
  onPress,
}: {
  title: string;
  sub: string;
  thumbs?: PlaylistSummary["thumbnails"];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.topRow,
        pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
      ]}
    >
      <Artwork thumbnails={thumbs} size={54} radius={8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  h1: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  gear: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  gearText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  liked: {
    marginHorizontal: 20,
    marginTop: 18,
    height: 96,
    borderRadius: 20,
    padding: 18,
    justifyContent: "flex-end",
  },
  likedTitle: {
    color: "#000",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  likedSub: { color: "rgba(0,0,0,0.6)", fontSize: 14, fontWeight: "600" },
  section: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 8,
  },
  statsHead: { marginTop: 28 },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  ranges: { paddingHorizontal: 20, gap: 8, marginBottom: 6 },
  range: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  rangeText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  rank: {
    width: 22,
    color: "rgba(255,255,255,0.5)",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "500" },
  rowSub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  plays: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
