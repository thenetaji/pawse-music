import type { HomeFeed, Shelf as ShelfT, Track } from "@studio/music-core";
import { player } from "@studio/player";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

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
import { useSetting } from "../../lib/settings";
import { useResource } from "../../lib/use-resource";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

export default function HomePage() {
  useTabRoot("home");
  const accent = useAccent();
  const [chip, setChip] = useState<string | undefined>();
  const home = useResource<HomeFeed>(`home:${chip ?? ""}`, () => yt.home(chip));
  const [more, setMore] = useState<{
    shelves: ShelfT[];
    continuation?: string;
    key: string;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = chip ?? "";
  const extra = more?.key === key ? more : null;
  const shelves = [...(home.data?.shelves ?? []), ...(extra?.shelves ?? [])];
  const cont = extra ? extra.continuation : home.data?.continuation;

  const loadMore = () => {
    if (!cont || loadingMore) return;
    setLoadingMore(true);
    yt.homeMore(cont)
      .then((r) =>
        setMore((m) => ({
          key,
          shelves: [...(m?.key === key ? m.shelves : []), ...r.shelves],
          continuation: r.continuation,
        })),
      )
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <Screen
      title={greeting()}
      background={<TopGlow />}
      onRefresh={home.reload}
      refreshing={false}
      onEndReached={loadMore}
      right={<HomeCat />}
    >
      <CatLine />
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
            entering={FadeInDown.duration(420).delay(Math.min(i, 6) * 60)}
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
      {loadingMore ? <SkeletonShelves count={1} /> : null}
    </Screen>
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
                radio: true,
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
      size={44}
      color={color}
      beatMs={900}
    />
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
  chips: { paddingHorizontal: 20, gap: 8, marginTop: 14 },
  catLine: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
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
  tileText: { flex: 1, color: "#fff", fontSize: 13, fontWeight: "600" },
});
