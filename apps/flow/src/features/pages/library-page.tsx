import type { Track } from "@studio/music-core";

import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Artwork } from "../../components/artwork";
import { useTabRoot } from "../../components/page";
import { Card } from "../../components/shelf";
import {
  CatState,
  PressScale,
  Screen,
  SectionTitle,
} from "../../components/ui";
import { useDownloads } from "../../data/downloads";
import { listeningStats, useLibrary } from "../../data/library";
import { go, push } from "../../lib/nav";
import { useSetting } from "../../lib/settings";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

export default function LibraryPage() {
  useTabRoot("library");
  const accent = useAccent();
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const ytPlaylists = useLibrary((s) => s.ytPlaylists);
  const albums = useLibrary((s) => s.savedAlbums);
  const artists = useLibrary((s) => s.followedArtists);
  const history = useLibrary((s) => s.history);
  const downloads = useDownloads();
  const name = useSetting("catName", "Mochi");
  const [now] = useState(() => Date.now());
  // Open-ended so plays made while this tab stays mounted still count.
  const week = listeningStats(history, now - 7 * 86400_000, Infinity);
  const empty =
    !liked.length && !playlists.length && !albums.length && !history.length;

  return (
    <Screen
      title="Library"
      background={<TopGlow height={340} />}
      right={
        <PressScale onPress={() => push("/settings")} style={styles.gear}>
          <Text style={styles.gearText}>Settings</Text>
        </PressScale>
      }
    >
      <View style={styles.tiles}>
        <PressScale
          onPress={() => go("/playlist/liked")}
          style={[styles.big, { backgroundColor: accent }]}
        >
          <Text style={styles.bigTitle}>Liked</Text>
          <Text style={styles.bigSub}>{liked.length} songs</Text>
        </PressScale>
        <PressScale
          onPress={() => push("/downloads")}
          style={[styles.big, styles.dark]}
        >
          <Text style={[styles.bigTitle, { color: "#fff" }]}>Downloads</Text>
          <Text style={[styles.bigSub, { color: "rgba(255,255,255,0.55)" }]}>
            {downloads.list.filter((d) => d.state === "done").length} songs
            {downloads.active ? ` · ${downloads.active} saving` : ""}
          </Text>
        </PressScale>
      </View>

      {week.plays > 0 ? (
        <PressScale onPress={() => go("/stats")} style={styles.stats}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statsKicker}>Your week</Text>
            <Text style={styles.statsBig}>{Math.round(week.minutes)} min</Text>
            <Text style={styles.statsSub} numberOfLines={1}>
              {week.topArtists[0]
                ? `Mostly ${week.topArtists[0].artist.name}`
                : `${week.plays} plays`}
            </Text>
          </View>
          <View style={styles.statsArt}>
            {week.topSongs.slice(0, 3).map((s, i) => (
              <Artwork
                key={s.track.id}
                thumbnails={s.track.thumbnails}
                size={54}
                radius={8}
                style={{
                  marginLeft: i ? -22 : 0,
                  transform: [{ rotate: `${(i - 1) * 8}deg` }],
                }}
              />
            ))}
          </View>
        </PressScale>
      ) : null}

      <SectionTitle title="Playlists" />
      {playlists.map((p, i) => (
        <Animated.View key={p.id} entering={FadeInDown.delay(i * 30)}>
          <Row
            title={p.title}
            sub={`${p.tracks.length} songs · Flow`}
            thumbs={p.tracks[0]?.thumbnails}
            onPress={() => go(`/playlist/${p.id}`)}
          />
        </Animated.View>
      ))}
      {ytPlaylists.map((p) => (
        <Row
          key={p.id}
          title={p.title}
          sub={["YouTube Music", p.trackCount ? `${p.trackCount} songs` : null]
            .filter(Boolean)
            .join(" · ")}
          thumbs={p.thumbnails}
          onPress={() => go(`/playlist/${p.id}`)}
        />
      ))}
      {!playlists.length && !ytPlaylists.length ? (
        <PressScale
          onPress={() => {
            const id = useLibrary.getState().createPlaylist("New playlist");
            go(`/playlist/${id}`);
          }}
          style={styles.newPl}
        >
          <Text style={styles.newPlText}>+ New playlist</Text>
        </PressScale>
      ) : null}

      {albums.length ? (
        <>
          <SectionTitle title="Albums" />
          <FlatList
            horizontal
            data={albums}
            keyExtractor={(a) => a.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hlist}
            renderItem={({ item }) => (
              <Card item={{ type: "album", ...item }} size={140} />
            )}
          />
        </>
      ) : null}
      {artists.length ? (
        <>
          <SectionTitle title="Artists" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hlist}
          >
            {artists.map((a) => (
              <Card key={a.id} item={{ type: "artist", ...a }} size={110} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionTitle
        title="History"
        onMore={history.length ? () => go("/history") : undefined}
      />
      {history.length ? (
        dedupe(history.map((h) => h.track))
          .slice(0, 5)
          .map((t) => (
            <Row
              key={t.id}
              title={t.title}
              sub={t.artists.map((a) => a.name).join(", ")}
              thumbs={t.thumbnails}
              onPress={() => go("/history")}
            />
          ))
      ) : empty ? (
        <CatState
          kind="empty"
          message={`${name} is waiting for your first song.`}
        />
      ) : (
        <Text style={styles.hint}>Nothing played yet.</Text>
      )}
    </Screen>
  );
}

function dedupe(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id));
}

function Row({
  title,
  sub,
  thumbs,
  onPress,
}: {
  title: string;
  sub: string;
  thumbs?: Track["thumbnails"];
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} scaleTo={0.98} style={styles.row}>
      <Artwork thumbnails={thumbs} size={54} radius={8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  gear: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  gearText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  tiles: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  big: {
    flex: 1,
    height: 104,
    borderRadius: 22,
    padding: 16,
    justifyContent: "flex-end",
  },
  dark: { backgroundColor: "rgba(255,255,255,0.09)" },
  bigTitle: {
    color: "#000",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  bigSub: {
    color: "rgba(0,0,0,0.6)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 1,
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 10,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  statsKicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statsBig: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 2,
  },
  statsSub: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 1 },
  statsArt: { flexDirection: "row", paddingRight: 6 },
  newPl: {
    marginHorizontal: 20,
    marginTop: 4,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.25)",
  },
  newPlText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  hlist: { paddingHorizontal: 20, gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "500" },
  rowSub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  chev: { color: "rgba(255,255,255,0.3)", fontSize: 22 },
});
