import type { HomeFeed, Shelf as ShelfT, Track } from "@studio/music-core";
import { player } from "@studio/player";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { Artwork } from "../../components/artwork";
import { useTabRoot } from "../../components/page";
import { Shelf } from "../../components/shelf";
import {
  CatState,
  Chip,
  PressScale,
  Screen,
  SectionTitle,
  SkeletonShelves,
} from "../../components/ui";
import type { DailyMix } from "../../data/account";
import { dailyMixes, useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { getSetting, useSetting } from "../../lib/settings";
import { useResource } from "../../lib/use-resource";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

type Mood = { title: string; params: string };

export default function HomePage() {
  useTabRoot("home");
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const [chip, setChip] = useState<string | undefined>();
  const home = useResource<HomeFeed>(`home:${chip ?? ""}`, () => yt.home(chip));
  const moods = useResource<Mood[]>("explore:moods", () => yt.moodsAndGenres());
  const key = chip ?? "";
  // Extra pages: YouTube's own continuations first, then one mood page at a time, so the feed never ends.
  const [more, setMore] = useState<{
    key: string;
    shelves: ShelfT[];
    continuation?: string;
    mood: number;
  }>({ key, shelves: [], mood: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const extra =
    more.key === key
      ? more
      : { key, shelves: [], continuation: undefined, mood: 0 };
  const cont =
    extra.shelves.length || extra.mood
      ? extra.continuation
      : home.data?.continuation;
  const shelves = [...(home.data?.shelves ?? []), ...extra.shelves];

  const loadMore = () => {
    if (loadingMore || !home.data) return;
    const list = moods.data ?? [];
    let next: Promise<{
      shelves: ShelfT[];
      continuation?: string;
      mood: number;
    }>;
    if (cont)
      next = yt.homeMore(cont).then((r) => ({
        shelves: r.shelves,
        continuation: r.continuation,
        mood: extra.mood,
      }));
    else if (extra.mood < list.length) {
      const m = list[extra.mood];
      next = yt.moodPage(m.params).then((sh) => ({
        shelves: sh
          .slice(0, 3)
          .map((x, i) =>
            i === 0 ? { ...x, title: `${m.title} · ${x.title}` } : x,
          ),
        mood: extra.mood + 1,
      }));
    } else return;
    setLoadingMore(true);
    next
      .then((r) =>
        setMore({
          key,
          shelves: [...extra.shelves, ...r.shelves],
          continuation: r.continuation,
          mood: r.mood,
        }),
      )
      .catch(() => setMore({ ...extra, key, mood: extra.mood + 1 }))
      .finally(() => setLoadingMore(false));
  };

  return (
    <Screen
      title={greeting()}
      background={<TopGlow />}
      onRefresh={home.reload}
      refreshing={false}
      onEndReached={loadMore}
      right={
        <View style={styles.headRight}>
          <HomeCat />
          <PressScale
            onPress={() => router.push("/settings")}
            style={styles.gear}
            accessibilityLabel="Settings"
          >
            <GearGlyph />
          </PressScale>
        </View>
      }
    >
      <CatLine />
      {!signedIn ? <SignInCard accent={accent} /> : null}
      {home.data?.chips.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {home.data.chips.map((c) => (
            <Chip
              key={c.params}
              label={c.title}
              on={c.params === chip}
              accent={accent}
              onPress={() => setChip(c.params === chip ? undefined : c.params)}
            />
          ))}
        </ScrollView>
      ) : null}
      {!chip ? <JumpBackIn /> : null}
      {!chip ? <Mixes /> : null}
      {home.data ? (
        shelves.map((s, i) => (
          <Animated.View
            key={`${s.title}${i}`}
            entering={FadeInDown.duration(420).delay(Math.min(i % 8, 6) * 60)}
          >
            <Shelf shelf={s} />
          </Animated.View>
        ))
      ) : home.error ? (
        <CatState
          kind="error"
          message="Couldn't load your feed."
          action="Try again"
          onAction={home.reload}
        />
      ) : (
        <SkeletonShelves />
      )}
      {home.data ? (
        <EndSpinner loading={loadingMore} onPress={loadMore} />
      ) : null}
    </Screen>
  );
}

// Keeps loading at the bottom; also tappable in case a scroll event was missed.
function EndSpinner({
  loading,
  onPress,
}: {
  loading: boolean;
  onPress: () => void;
}) {
  return loading ? (
    <SkeletonShelves count={1} />
  ) : (
    <Pressable onPress={onPress} style={styles.more}>
      <Text style={styles.moreText}>More music</Text>
    </Pressable>
  );
}

function SignInCard({ accent }: { accent: string }) {
  const color = useSetting<CatColor>("catColor", "orange");
  const name = useSetting("catName", "Mochi");
  return (
    <PressScale
      onPress={() => router.push("/sign-in")}
      style={[styles.signIn, { borderColor: accent }]}
    >
      <Cat mood="curious" size={54} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.signTitle}>Make it yours</Text>
        <Text style={styles.signSub}>
          Sign in to YouTube Music so {name} learns your taste.
        </Text>
      </View>
      <Text style={[styles.signGo, { color: accent }]}>Sign in</Text>
    </PressScale>
  );
}

// "Jump back in": your recent plays as big tiles, one tap to resume.
function JumpBackIn() {
  const history = useLibrary((s) => s.history);
  const seen = new Set<string>();
  const recent: Track[] = [];
  for (const h of history) {
    if (seen.has(h.track.id)) continue;
    seen.add(h.track.id);
    recent.push(h.track);
    if (recent.length === 6) break;
  }
  if (recent.length < 2) return null;
  return (
    <View>
      <SectionTitle title="Jump back in" />
      <View style={styles.grid}>
        {recent.map((t, i) => (
          <PressScale
            key={t.id}
            onPress={() =>
              void player.play(recent, i, {
                radio: getSetting("radioContinue", true),
                source: { type: "library", title: "Recently played" },
              })
            }
            style={styles.tile}
          >
            <Artwork thumbnails={t.thumbnails} size={52} radius={8} />
            <Text style={styles.tileText} numberOfLines={2}>
              {t.title}
            </Text>
          </PressScale>
        ))}
      </View>
    </View>
  );
}

// Daily mixes: endless radios seeded from your top artists.
function Mixes() {
  const mixes = useResource<DailyMix[]>("home:mixes", () => dailyMixes());
  if (!mixes.data?.length) return null;
  return (
    <View>
      <SectionTitle title="Your mixes" kicker="Made for you" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
      >
        {mixes.data.map((m, i) => (
          <PressScale
            key={m.playlistId}
            onPress={() =>
              void player.playRadio({
                playlistId: m.playlistId,
                title: `${m.artist.name} mix`,
              })
            }
            style={styles.mix}
          >
            <Artwork thumbnails={m.artist.thumbnails} size={152} radius={18} />
            <View
              style={[styles.mixBand, { backgroundColor: MIX[i % MIX.length] }]}
            >
              <Text style={styles.mixNo}>Mix {i + 1}</Text>
            </View>
            <Text style={styles.mixName} numberOfLines={1}>
              {m.artist.name} and more
            </Text>
          </PressScale>
        ))}
      </ScrollView>
    </View>
  );
}
const MIX = ["#FF5A7A", "#8B7CFF", "#2ED3A2", "#FF9F43", "#38B6FF", "#F5D547"];

function HomeCat() {
  const color = useSetting<CatColor>("catColor", "orange");
  const h = new Date().getHours();
  return (
    <Cat
      mood={h >= 23 || h < 6 ? "sleep" : "groove"}
      size={40}
      color={color}
      beatMs={900}
    />
  );
}

function GearGlyph() {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function CatLine() {
  const name = useSetting("catName", "Mochi");
  const h = new Date().getHours();
  const line =
    h < 6
      ? `${name} is asleep. Keep it soft.`
      : h < 12
        ? `${name} picked something bright for the morning.`
        : h < 17
          ? `${name} is in the mood for anything.`
          : h < 23
            ? `${name} is warming up the evening.`
            : `${name} is napping. Night mode.`;
  return <Text style={styles.catLine}>{line}</Text>;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5
    ? "Late night"
    : h < 12
      ? "Good morning"
      : h < 17
        ? "Afternoon"
        : "Evening";
}

const styles = StyleSheet.create({
  headRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  gear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chips: { paddingHorizontal: 20, gap: 8, marginTop: 14 },
  catLine: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  signIn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  signTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  signSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
  signGo: { fontSize: 15, fontWeight: "800" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
  },
  tile: {
    width: "48.6%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    paddingRight: 8,
  },
  tileText: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
  mix: { width: 152 },
  mixBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 118,
    height: 34,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  mixNo: { color: "#000", fontSize: 14, fontWeight: "900" },
  mixName: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 8 },
  more: {
    alignSelf: "center",
    marginTop: 26,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  moreText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
