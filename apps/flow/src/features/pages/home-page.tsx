import type { HomeFeed } from "@studio/music-core";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ErrorState,
  Loading,
  useBottomSpace,
  useTabRoot,
} from "../../components/page";
import { Shelf } from "../../components/shelf";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

export default function HomePage() {
  useTabRoot("home");
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const accent = useAccent();
  const [chip, setChip] = useState<string | undefined>();
  const home = useResource<HomeFeed>(`home:${chip ?? ""}`, () => yt.home(chip));
  const chips = home.data?.chips ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <TopGlow />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: bottom,
        }}
        refreshControl={
          <RefreshControl
            tintColor="#fff"
            refreshing={false}
            onRefresh={home.reload}
          />
        }
      >
        <Text style={styles.h1}>{greeting()}</Text>
        {chips.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {chips.map((c) => {
              const on = c.params === chip;
              return (
                <Pressable
                  key={c.params}
                  onPress={() => setChip(on ? undefined : c.params)}
                  style={[
                    styles.chip,
                    on && { backgroundColor: accent, borderColor: accent },
                  ]}
                >
                  <Text style={[styles.chipText, on && { color: "#000" }]}>
                    {c.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {home.data ? (
          <Animated.View entering={FadeIn.duration(300)}>
            {home.data.shelves.map((s, i) => (
              <Shelf key={`${s.title}${i}`} shelf={s} />
            ))}
          </Animated.View>
        ) : home.error ? (
          <ErrorState message="Couldn't load your feed" onRetry={home.reload} />
        ) : (
          <Loading />
        )}
      </ScrollView>
    </View>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5
    ? "Late night"
    : h < 12
      ? "Morning"
      : h < 17
        ? "Afternoon"
        : "Evening";
}

const styles = StyleSheet.create({
  h1: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  chips: { paddingHorizontal: 20, gap: 8, marginTop: 14 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  chipText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
