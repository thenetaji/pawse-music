import type { Thumbnail, Track } from "@pawse/music-core";
import { player } from "@pawse/player";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { Artwork } from "../../components/artwork";
import { useTabRoot } from "../../components/page";
import { Card } from "../../components/shelf";
import { TrackRow } from "../../components/track-row";
import {
  CatState,
  Chip,
  PressScale,
  Screen,
  SectionTitle,
} from "../../components/ui";
import { maybeSyncLibrary } from "../../data/account";
import { useDownloads, useOfflineTracks } from "../../data/downloads";
import { listeningStats, useLibrary } from "../../data/library";
import { useSmartPlaylists } from "../../data/recommend";
import { go, push } from "../../lib/nav";
import { count } from "../../lib/plural";
import { getSetting, useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

type Filter = "playlists" | "albums" | "artists" | "songs";
type Sort = "recent" | "az" | "plays";
const SORTS: Record<Sort, string> = {
  recent: "Recent",
  az: "A–Z",
  plays: "Most played",
};

export default function LibraryPage() {
  useTabRoot("library");
  const accent = useAccent();
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const ytPlaylists = useLibrary((s) => s.ytPlaylists);
  const albums = useLibrary((s) => s.savedAlbums);
  const artists = useLibrary((s) => s.followedArtists);
  const history = useLibrary((s) => s.history);
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const downloads = useDownloads();
  const offline = useOfflineTracks();
  const smart = useSmartPlaylists().filter((p) => p.tracks.length >= 3);
  const name = useSetting("catName", "Mochi");
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("playlists");
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  // Open-ended so plays made while this tab stays mounted still count.
  const week = listeningStats(history, now - 7 * 86400_000, Infinity);
  const empty =
    !liked.length && !playlists.length && !albums.length && !history.length;

  // Pulls the YouTube library at most every few hours, and only from here.
  useEffect(() => {
    if (signedIn) void maybeSyncLibrary().catch(() => {});
  }, [signedIn]);

  const plays = playCounts(history);
  const q = query.trim().toLowerCase();
  const hit = (...xs: (string | undefined)[]) =>
    !q || xs.some((x) => x?.toLowerCase().includes(q));

  const songs = sortTracks(
    dedupe([...liked, ...history.map((h) => h.track)]).filter((t) =>
      hit(t.title, ...t.artists.map((a) => a.name), t.album?.title),
    ),
    sort,
    plays,
  );
  const lists = [
    ...playlists.map((p) => ({
      id: p.id,
      title: p.title,
      sub: `${count(p.tracks.length, "song")} · Pawse`,
      thumbs: p.tracks[0]?.thumbnails,
      at: p.updatedAt,
    })),
    ...ytPlaylists.map((p) => ({
      id: p.id,
      title: p.title,
      sub: [
        "YouTube Music",
        p.trackCount ? `${count(p.trackCount, "song")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      thumbs: p.thumbnails,
      at: 0,
    })),
  ]
    .filter((p) => hit(p.title))
    .sort((a, b) =>
      sort === "az" ? a.title.localeCompare(b.title) : b.at - a.at,
    );
  const albumList = albums
    .filter((a) => hit(a.title, ...a.artists.map((x) => x.name)))
    .sort((a, b) => (sort === "az" ? a.title.localeCompare(b.title) : 0));
  const artistList = artists
    .filter((a) => hit(a.name))
    .sort((a, b) => (sort === "az" ? a.name.localeCompare(b.name) : 0));

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
        <Tile
          title="Liked"
          sub={`${count(liked.length, "song")}`}
          color={accent}
          dark
          onPress={() => go("/playlist/liked")}
        />
        <Tile
          title="Downloads"
          sub={`${count(downloads.list.filter((d) => d.state === "done").length, "song")}${
            downloads.active ? ` · ${downloads.active} saving` : ""
          }`}
          onPress={() => push("/downloads")}
        />
        <Tile
          title="Offline"
          sub={`${count(offline.length, "song")} ready`}
          onPress={() => go("/playlist/offline")}
        />
        <Tile
          title="History"
          sub={`${count(history.length, "play")}`}
          onPress={() => go("/history")}
        />
      </View>

      {smart.length ? (
        <>
          <SectionTitle title="Made for you" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hlist}
          >
            {smart.map((p, i) => (
              <Animated.View
                key={p.id}
                entering={FadeInDown.duration(320).delay(i * 40)}
              >
                <SmartCard
                  tint={SMART_TINTS[i % SMART_TINTS.length]}
                  title={p.title}
                  sub={p.subtitle}
                  tracks={p.tracks}
                  onPress={() => go(`/playlist/smart-${p.id}`)}
                />
              </Animated.View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {artists.length ? (
        <>
          <SectionTitle title="Your artists" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hlist}
          >
            {artists.map((a) => (
              <PressScale
                key={a.id}
                onPress={() => go(`/artist/${a.id}`)}
                style={styles.artist}
              >
                <Artwork thumbnails={a.thumbnails} size={84} radius={42} />
                <Text style={styles.artistName} numberOfLines={1}>
                  {a.name}
                </Text>
              </PressScale>
            ))}
          </ScrollView>
        </>
      ) : null}

      {week.plays > 0 ? (
        <PressScale onPress={() => go("/stats")} style={styles.stats}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statsKicker}>Your week</Text>
            <Text style={styles.statsBig}>{Math.round(week.minutes)} min</Text>
            <Text style={styles.statsSub} numberOfLines={1}>
              {week.topArtists[0]
                ? `Mostly ${week.topArtists[0].artist.name}`
                : `${count(week.plays, "play")}`}
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

      {empty ? (
        <View style={styles.welcome}>
          <CatState
            kind="empty"
            message={`${name} is waiting for your first song. Bring your music over, or just start playing.`}
          />
          <PressScale
            onPress={() => push("/import")}
            style={[styles.cta, { backgroundColor: accent }]}
          >
            <Text style={styles.ctaText}>Import your music</Text>
          </PressScale>
          <Text style={styles.ctaHint}>
            From YouTube Music, Google Takeout, Apple Music or a playlist link.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.search}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your library"
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.searchInput}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <PressScale
              onPress={() =>
                setSort((s) =>
                  s === "recent" ? "az" : s === "az" ? "plays" : "recent",
                )
              }
              style={styles.sort}
              accessibilityLabel={`Sort: ${SORTS[sort]}`}
            >
              <Text style={styles.sortText}>↕ {SORTS[sort]}</Text>
            </PressScale>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {(["playlists", "albums", "artists", "songs"] as Filter[]).map(
              (f) => (
                <Chip
                  key={f}
                  label={f[0].toUpperCase() + f.slice(1)}
                  on={filter === f}
                  accent={accent}
                  onPress={() => setFilter(f)}
                />
              ),
            )}
          </ScrollView>

          <Animated.View key={filter} entering={FadeIn.duration(200)}>
            {filter === "playlists" ? (
              <>
                <PressScale
                  onPress={() => {
                    const id = useLibrary
                      .getState()
                      .createPlaylist("New playlist");
                    go(`/playlist/${id}`);
                  }}
                  scaleTo={0.98}
                  style={styles.row}
                >
                  <View style={styles.plus}>
                    <Text style={styles.plusText}>+</Text>
                  </View>
                  <Text style={styles.rowTitle}>New playlist</Text>
                </PressScale>
                <PressScale
                  onPress={() => push("/import")}
                  scaleTo={0.98}
                  style={styles.row}
                >
                  <View style={styles.plus}>
                    <Text style={styles.plusText}>↓</Text>
                  </View>
                  <Text style={styles.rowTitle}>Import playlists</Text>
                </PressScale>
                {lists.map((p) => (
                  <Row
                    key={p.id}
                    title={p.title}
                    sub={p.sub}
                    thumbs={p.thumbs}
                    onPress={() => go(`/playlist/${p.id}`)}
                  />
                ))}
              </>
            ) : filter === "albums" ? (
              albumList.length ? (
                <FlatList
                  scrollEnabled={false}
                  data={albumList}
                  numColumns={2}
                  keyExtractor={(a) => a.id}
                  columnWrapperStyle={styles.gridRow}
                  contentContainerStyle={styles.grid}
                  renderItem={({ item }) => (
                    <Card item={{ type: "album", ...item }} size={GRID} />
                  )}
                />
              ) : (
                <Hint text="Albums you save show up here." />
              )
            ) : filter === "artists" ? (
              artistList.length ? (
                artistList.map((a) => (
                  <Row
                    key={a.id}
                    title={a.name}
                    sub="Artist"
                    thumbs={a.thumbnails}
                    round
                    onPress={() => go(`/artist/${a.id}`)}
                  />
                ))
              ) : (
                <Hint text="Follow artists from their page to keep them here." />
              )
            ) : songs.length ? (
              songs.slice(0, 200).map((t, i) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  subtitle={
                    sort === "plays" && plays.get(t.id)
                      ? `${count(plays.get(t.id) ?? 0, "play")} · ${t.artists.map((a) => a.name).join(", ")}`
                      : undefined
                  }
                  onPress={() =>
                    void player.play(songs, i, {
                      source: { type: "library", title: "Your songs" },
                      radio: getSetting("radioContinue", true),
                    })
                  }
                />
              ))
            ) : (
              <Hint text="Songs you like or play show up here." />
            )}
          </Animated.View>
        </>
      )}
    </Screen>
  );
}

const GRID = 160;
// Each smart playlist gets its own colour so the cards read apart at a glance.
const SMART_TINTS = ["#C2185B", "#5E35B1", "#00897B", "#EF6C00", "#1E88E5"];
const SMART = 150;

function playCounts(history: { track: Track }[]) {
  const m = new Map<string, number>();
  for (const h of history) m.set(h.track.id, (m.get(h.track.id) ?? 0) + 1);
  return m;
}

function sortTracks(tracks: Track[], sort: Sort, plays: Map<string, number>) {
  if (sort === "az")
    return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "plays")
    return [...tracks].sort(
      (a, b) => (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0),
    );
  return tracks;
}

function dedupe(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id));
}

function Tile({
  title,
  sub,
  color,
  dark,
  onPress,
}: {
  title: string;
  sub: string;
  color?: string;
  dark?: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: color ?? "rgba(255,255,255,0.09)" },
      ]}
    >
      <Text style={[styles.tileTitle, dark && { color: "#000" }]}>{title}</Text>
      <Text
        style={[styles.tileSub, dark && { color: "rgba(0,0,0,0.6)" }]}
        numberOfLines={1}
      >
        {sub}
      </Text>
    </PressScale>
  );
}

// Four covers from the list in a square, title over a soft fade.
function SmartCard({
  tint,
  title,
  sub,
  tracks,
  onPress,
}: {
  tint: string;
  title: string;
  sub: string;
  tracks: Track[];
  onPress: () => void;
}) {
  const covers: Thumbnail[][] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    const key = t.album?.id ?? t.id;
    if (seen.has(key) || !t.thumbnails.length) continue;
    seen.add(key);
    covers.push(t.thumbnails);
    if (covers.length === 4) break;
  }
  return (
    <PressScale onPress={onPress} style={{ width: SMART }}>
      <View style={styles.mosaic}>
        {covers.length >= 4 ? (
          covers.map((c, i) => (
            <Artwork key={i} thumbnails={c} size={SMART / 2} radius={0} />
          ))
        ) : (
          <Artwork
            thumbnails={covers[0]}
            size={SMART}
            radius={0}
            seed={title}
          />
        )}
        <LinearGradient
          colors={[`${tint}00`, `${tint}cc`, tint]}
          locations={[0, 0.55, 1]}
          style={styles.mosaicFade}
        />
        <Text style={styles.mosaicTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Text style={styles.smartSub} numberOfLines={1}>
        {sub}
      </Text>
    </PressScale>
  );
}

function Row({
  title,
  sub,
  thumbs,
  round,
  onPress,
}: {
  title: string;
  sub: string;
  thumbs?: Track["thumbnails"];
  round?: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} scaleTo={0.98} style={styles.row}>
      <Artwork
        thumbnails={thumbs}
        size={54}
        radius={8}
        round={round}
        seed={title}
      />
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

const Hint = ({ text }: { text: string }) => (
  <Text style={styles.hint}>{text}</Text>
);

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
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  tile: {
    width: "48.5%",
    height: 92,
    borderRadius: 20,
    padding: 15,
    justifyContent: "flex-end",
  },
  tileTitle: {
    color: "#fff",
    fontSize: 20,
    ...display("900"),
    letterSpacing: -0.4,
  },
  tileSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    ...display("700"),
    marginTop: 1,
  },
  mosaic: {
    width: SMART,
    height: SMART,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#141418",
  },
  mosaicFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
  },
  mosaicTitle: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    color: "#fff",
    fontSize: 17,
    ...display("900"),
    letterSpacing: -0.3,
  },
  smartSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 6 },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 18,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  statsKicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    ...display("800"),
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statsBig: {
    color: "#fff",
    fontSize: 28,
    ...display("900"),
    letterSpacing: -0.8,
    marginTop: 2,
  },
  statsSub: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 1 },
  statsArt: { flexDirection: "row", paddingRight: 6 },
  welcome: { alignItems: "center", paddingHorizontal: 28, marginTop: 12 },
  cta: {
    marginTop: 4,
    height: 50,
    paddingHorizontal: 26,
    borderRadius: 25,
    justifyContent: "center",
  },
  ctaText: { color: "#000", fontSize: 16, ...display("800") },
  ctaHint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13.5,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 19,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 22,
  },
  searchInput: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#fff",
    fontSize: 16,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  chips: {
    paddingHorizontal: 20,
    gap: 8,
    paddingTop: 12,
    paddingBottom: 6,
    alignItems: "center",
  },
  sort: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  sortText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },
  plus: {
    width: 54,
    height: 54,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  plusText: { color: "#fff", fontSize: 24, fontWeight: "500" },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  hlist: { paddingHorizontal: 20, gap: 14 },
  artist: { width: 84, alignItems: "center", gap: 7 },
  artistName: { color: "#fff", fontSize: 13, fontWeight: "500" },
  grid: { paddingHorizontal: 20, paddingTop: 6 },
  gridRow: { justifyContent: "space-between", marginBottom: 16 },
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
