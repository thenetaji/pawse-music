import type { Shelf as ShelfT } from "@studio/music-core";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useTabRoot } from "../../components/page";
import { Shelf } from "../../components/shelf";
import {
  CatState,
  PressScale,
  Screen,
  SectionTitle,
  SkeletonShelves,
} from "../../components/ui";
import { yt } from "../../lib/engine";
import { go } from "../../lib/nav";
import { useSetting } from "../../lib/settings";
import { useResource } from "../../lib/use-resource";
import { TopGlow } from "./top-glow";

type Tile = { title: string; params: string; color?: string };

export default function ExplorePage() {
  useTabRoot("explore");
  const region = useSetting("region", "IN");
  const moods = useResource<Tile[]>("explore:moods", () => yt.moodsAndGenres());
  const releases = useResource<ShelfT[]>("explore:new", () => yt.newReleases());
  const charts = useResource<ShelfT[]>(`explore:charts:${region}`, () =>
    yt.charts(region),
  );

  return (
    <Screen
      title="Explore"
      background={<TopGlow height={300} />}
      onRefresh={() => (moods.reload(), releases.reload(), charts.reload())}
    >
      <SectionTitle title="Moods and genres" />
      {moods.data ? (
        <View style={styles.grid}>
          {moods.data.slice(0, 16).map((m, i) => (
            <Animated.View
              key={m.params}
              entering={FadeInDown.duration(360).delay(Math.min(i, 10) * 35)}
              style={styles.cell}
            >
              <PressScale
                onPress={() =>
                  go(
                    `/mood/${encodeURIComponent(m.params)}?title=${encodeURIComponent(m.title)}`,
                  )
                }
                style={[styles.tile, { backgroundColor: tint(m.color, i) }]}
              >
                <View
                  style={[
                    styles.stripe,
                    { backgroundColor: "rgba(255,255,255,0.22)" },
                  ]}
                />
                <Text style={styles.tileText} numberOfLines={2}>
                  {m.title}
                </Text>
              </PressScale>
            </Animated.View>
          ))}
        </View>
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
      {!releases.data && !charts.data ? <SkeletonShelves count={2} /> : null}
    </Screen>
  );
}

const PALETTE = [
  "#E2455B",
  "#F08A3C",
  "#E8B931",
  "#3FB27F",
  "#2F9ED8",
  "#5B6CF0",
  "#9A5BEF",
  "#D9539E",
  "#1FA59A",
  "#C46A3A",
];
function tint(color: string | undefined, i: number) {
  return color ?? PALETTE[i % PALETTE.length];
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
  },
  cell: { width: "48.4%" },
  tile: {
    height: 84,
    borderRadius: 14,
    padding: 14,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  stripe: {
    position: "absolute",
    right: -18,
    top: -18,
    width: 70,
    height: 70,
    borderRadius: 18,
    transform: [{ rotate: "24deg" }],
  },
  tileText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});
