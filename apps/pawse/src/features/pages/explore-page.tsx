import type { Shelf as ShelfT } from "@pawse/music-core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { MoodTile } from "../../components/mood-tile";
import { useTabRoot } from "../../components/page";
import { Shelf } from "../../components/shelf";
import {
  CatState,
  Screen,
  SectionTitle,
  SkeletonShelves,
} from "../../components/ui";
import { yt } from "../../lib/engine";
import { useSetting } from "../../lib/settings";
import { useResource } from "../../lib/use-resource";
import { TopGlow } from "./top-glow";

type Tile = { title: string; params: string; color?: string };

export default function ExplorePage() {
  useTabRoot("explore");
  const region = useSetting("region", "IN");
  const moods = useResource<Tile[]>(
    "explore:moods",
    () => yt.moodsAndGenres(),
    { keep: true },
  );
  const releases = useResource<ShelfT[]>(
    "explore:new",
    () => yt.newReleases(),
    { keep: true },
  );
  const charts = useResource<ShelfT[]>(
    `explore:charts:${region}`,
    () => yt.charts(region),
    { keep: true },
  );
  const [all, setAll] = useState(false);
  // Below the charts, one mood after another keeps the page going.
  const [endless, setEndless] = useState<{ shelves: ShelfT[]; next: number }>({
    shelves: [],
    next: 0,
  });
  const [loading, setLoading] = useState(false);
  const list = moods.data ?? [];

  const loadMore = () => {
    if (loading || endless.next >= list.length) return;
    const m = list[endless.next];
    setLoading(true);
    yt.moodPage(m.params)
      .then((sh) =>
        setEndless((e) => ({
          next: e.next + 1,
          shelves: [
            ...e.shelves,
            ...sh
              .slice(0, 2)
              .map((x) => ({ ...x, title: `${m.title} · ${x.title}` })),
          ],
        })),
      )
      .catch(() => setEndless((e) => ({ ...e, next: e.next + 1 })))
      .finally(() => setLoading(false));
  };

  const tiles = all ? list : list.slice(0, 12);
  return (
    <Screen
      title="Explore"
      background={<TopGlow height={300} />}
      onRefresh={() => (moods.reload(), releases.reload(), charts.reload())}
      onEndReached={loadMore}
    >
      <SectionTitle title="Moods and genres" />
      {moods.data ? (
        <>
          <View style={styles.grid}>
            {tiles.map((m, i) => (
              <Animated.View
                key={m.params}
                entering={FadeInDown.duration(360).delay(Math.min(i, 10) * 35)}
                style={styles.cell}
              >
                <MoodTile
                  title={m.title}
                  params={m.params}
                  color={m.color}
                  index={i}
                />
              </Animated.View>
            ))}
          </View>
          {list.length > 12 ? (
            <Pressable onPress={() => setAll((a) => !a)} style={styles.toggle}>
              <Text style={styles.toggleText}>
                {all ? "Show fewer" : `Show all ${list.length}`}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : moods.error ? (
        <CatState
          kind="error"
          message="Couldn't load moods."
          action="Try again"
          onAction={moods.reload}
        />
      ) : (
        <SkeletonShelves count={1} />
      )}
      {(releases.data ?? []).map((s, i) => (
        <Shelf
          key={`n${i}`}
          shelf={{ ...s, title: i === 0 ? "New releases" : s.title }}
        />
      ))}
      {(charts.data ?? []).map((s, i) => (
        <Shelf key={`c${i}`} shelf={s} />
      ))}
      {endless.shelves.map((s, i) => (
        <Animated.View key={`e${i}`} entering={FadeInDown.duration(400)}>
          <Shelf shelf={s} />
        </Animated.View>
      ))}
      {!releases.data && !charts.data ? <SkeletonShelves count={2} /> : null}
      {loading ? (
        <SkeletonShelves count={1} />
      ) : endless.next < list.length ? (
        <Pressable onPress={loadMore} style={styles.toggle}>
          <Text style={styles.toggleText}>More to explore</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
  },
  cell: { width: "48.5%" },
  toggle: {
    alignSelf: "center",
    marginTop: 18,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  toggleText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
