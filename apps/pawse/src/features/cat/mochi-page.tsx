import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showToast } from "../../components/toast";
import { haptic } from "../../lib/haptics";
import { setSetting, useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";
import { Cat, type CatColor, type CatMood } from "./cat";
import { refreshMochi } from "./mochi";
import {
  findItem,
  isEarned,
  type Item,
  itemsFor,
  type MochiStats,
  progressText,
  type Slot,
  STREAK_MINUTES,
} from "./mochi-core";

const NONE: MochiStats = { streak: 0, best: 0, today: 0, hours: 0, artists: 0 };
const KEY: Record<Slot, string> = {
  hat: "mochiHat",
  cups: "mochiCups",
  idle: "mochiIdle",
};
const FIRST: Record<Slot, string> = {
  hat: "none",
  cups: "artwork",
  idle: "sleep",
};
const SECTIONS: { slot: Slot; title: string }[] = [
  { slot: "hat", title: "Hats" },
  { slot: "cups", title: "Headphones" },
  { slot: "idle", title: "When the music stops" },
];

export default function MochiPage() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const name = useSetting("catName", "Mochi");
  const color = useSetting<CatColor>("catColor", "orange");
  const unlocked = useSetting<string[]>("mochiUnlocked", []);
  const hat = useSetting("mochiHat", "none");
  const cups = findItem("cups", useSetting("mochiCups", "artwork"))?.cups;
  const [stats, setStats] = useState(NONE);
  useEffect(() => {
    void refreshMochi(false)
      .then(setStats)
      .catch(() => {});
  }, []);

  const left = Math.max(0, STREAK_MINUTES - stats.today);
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 60 }}
    >
      <View style={styles.head}>
        <Text style={styles.h1}>{name}</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <Cat mood="happy" size={150} color={color} />
        <Text style={[styles.streak, { color: accent }]}>{stats.streak}</Text>
        <Text style={styles.streakLabel}>
          {stats.streak === 1 ? "day in a row" : "days in a row"}
        </Text>
        <Text style={styles.note}>
          {left > 0
            ? `${left} more minutes of music today keeps it going.`
            : `${name} is proud of you today.`}
        </Text>
      </View>
      <View style={styles.stats}>
        <Stat value={String(stats.best)} label="best streak" />
        <Stat value={String(Math.floor(stats.hours))} label="hours of music" />
        <Stat value={String(stats.artists)} label="artists" />
      </View>
      {SECTIONS.map(({ slot, title }) => (
        <View key={slot}>
          <Text style={styles.section}>{title}</Text>
          <View style={styles.grid}>
            {itemsFor(slot).map((item) => (
              <Tile
                key={item.id}
                item={item}
                color={color}
                hat={hat}
                cups={cups}
                accent={accent}
                open={!item.need || unlocked.includes(item.id)}
                stats={stats}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Tile({
  item,
  color,
  hat,
  cups,
  accent,
  open,
  stats,
}: {
  item: Item;
  color: CatColor;
  hat: string;
  cups?: [string, string];
  accent: string;
  open: boolean;
  stats: MochiStats;
}) {
  const on = useSetting(KEY[item.slot], FIRST[item.slot]) === item.id;
  const equip = () => {
    if (!open && !isEarned(item, stats)) {
      haptic.light();
      showToast(progressText(item, stats));
      return;
    }
    haptic.tick();
    setSetting(KEY[item.slot], item.id);
  };
  return (
    <Pressable
      onPress={equip}
      style={[styles.tile, on && { borderColor: accent }]}
    >
      <View style={!open && styles.locked}>
        <Cat
          mood={item.slot === "idle" ? (item.id as CatMood) : "idle"}
          size={64}
          color={color}
          hat={item.slot === "hat" ? item.id : hat}
          cups={item.slot === "cups" ? item.cups : cups}
        />
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.tileNeed} numberOfLines={1}>
        {open ? (on ? "Wearing" : " ") : progressText(item, stats)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  h1: { color: "#fff", fontSize: 34, ...display("800"), letterSpacing: -0.8 },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  hero: { alignItems: "center", marginTop: 8 },
  streak: { fontSize: 64, ...display("900"), letterSpacing: -2, marginTop: 4 },
  streakLabel: {
    color: "#fff",
    fontSize: 17,
    ...display("700"),
    marginTop: -6,
  },
  note: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 32,
    textAlign: "center",
  },
  stats: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 22,
  },
  stat: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  statValue: { color: "#fff", fontSize: 24, ...display("800") },
  statLabel: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  section: {
    color: "#fff",
    fontSize: 22,
    ...display("800"),
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
  },
  tile: {
    width: "31.4%",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  locked: { opacity: 0.3 },
  tileName: { color: "#fff", fontSize: 13, ...display("700"), marginTop: 6 },
  tileNeed: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
});
