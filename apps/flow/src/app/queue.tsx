import { artistLine, type Track } from "@studio/music-core";
import { player, usePlayerState, usePlayerStore } from "@studio/player";
import { router } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOutDown,
} from "react-native-reanimated";
import ReorderableList, {
  type ReorderableListReorderEvent,
  useIsActive,
  useReorderableDrag,
} from "react-native-reorderable-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

import { showSheet } from "../components/action-sheet";
import { Artwork, TrackArt } from "../components/artwork";
import { EqBars } from "../components/eq-bars";
import { SwipeRow, swipedRecently } from "../components/swipe-row";
import { PressScale } from "../components/ui";
import { Cat, type CatColor } from "../features/cat/cat";
import { ColorField } from "../features/now-playing/color-field";
import { useAccent, useNowPalette } from "../features/now-playing/now-palette";
import { ShuffleGlyph } from "../features/pages/collection";
import { haptic } from "../lib/haptics";
import { useSetting } from "../lib/settings";

const SLEEP = [15, 30, 45, 60, 90];
const UNDO_MS = 4000;

// The last removed song, offered back for a few seconds.
type Removed = {
  track: Track;
  at: number;
  timer: ReturnType<typeof setTimeout>;
};
const useUndo = create<{ removed: Removed | null }>(() => ({ removed: null }));

function removeWithUndo(track: Track, at: number) {
  player.remove(at);
  const prev = useUndo.getState().removed;
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => useUndo.setState({ removed: null }), UNDO_MS);
  useUndo.setState({ removed: { track, at, timer } });
}

function undoRemove() {
  const r = useUndo.getState().removed;
  if (!r) return;
  clearTimeout(r.timer);
  useUndo.setState({ removed: null });
  haptic.light();
  player.addNext(r.track);
  const next = usePlayerStore.getState().index + 1;
  if (r.at !== next) player.move(next, r.at);
}

export default function Queue() {
  const { queue, index, shuffle, repeat, sleepAt, status, source } =
    usePlayerState();
  const accent = useAccent();
  const palette = useNowPalette((s) => s.palette);
  const color = useSetting<CatColor>("catColor", "orange");
  const current = queue[index];
  const upNext = queue.slice(index + 1);
  const sleepLabel =
    sleepAt === "endOfTrack"
      ? "End of song"
      : sleepAt
        ? new Date(sleepAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "Sleep";

  const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
    haptic.light();
    player.move(index + 1 + from, index + 1 + to);
  };

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ColorField palette={palette} playing={false} />
      </View>
      <View style={styles.head}>
        <View style={styles.grabber} />
        <View style={styles.headRow}>
          <Text style={styles.headTitle}>Queue</Text>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
      </View>
      {current ? (
        <View style={styles.now}>
          <TrackArt track={current} size={64} radius={10} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>Now playing</Text>
            <Text style={styles.nowTitle} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.nowSub} numberOfLines={1}>
              {artistLine(current.artists)}
            </Text>
          </View>
          <EqBars color={accent} playing={status === "playing"} size={18} />
        </View>
      ) : null}

      <View style={styles.controls}>
        <Toggle
          on={shuffle}
          accent={accent}
          label="Shuffle"
          icon={<ShuffleGlyph color={shuffle ? "#000" : "#fff"} />}
          onPress={() => player.setShuffle(!shuffle)}
        />
        <Toggle
          on={repeat !== "off"}
          accent={accent}
          label={repeat === "one" ? "Repeat 1" : "Repeat"}
          onPress={() =>
            player.setRepeat(
              repeat === "off" ? "all" : repeat === "all" ? "one" : "off",
            )
          }
        />
        <Toggle
          on={!!sleepAt}
          accent={accent}
          label={sleepLabel}
          onPress={() =>
            showSheet({
              header: (
                <View style={{ alignItems: "center" }}>
                  <Cat mood="sleep" size={64} color={color} />
                  <Text style={styles.sheetTitle}>Sleep timer</Text>
                </View>
              ),
              actions: [
                ...SLEEP.map((m) => ({
                  label: `${m} minutes`,
                  onPress: () => player.setSleepTimer(m),
                })),
                {
                  label: "End of this song",
                  onPress: () => player.setSleepTimer("endOfTrack"),
                },
                ...(sleepAt
                  ? [
                      {
                        label: "Turn off",
                        destructive: true,
                        onPress: () => player.setSleepTimer(null),
                      },
                    ]
                  : []),
              ],
            })
          }
        />
      </View>

      <View style={styles.listHead}>
        <Text style={styles.section}>Up next</Text>
        {source?.title ? (
          <Text style={styles.from} numberOfLines={1}>
            from {source.title}
          </Text>
        ) : null}
      </View>

      {upNext.length ? (
        <ReorderableList
          data={upNext}
          keyExtractor={(t, i) => `${t.id}:${i}`}
          onReorder={onReorder}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item, index: i }) => (
            <Row track={item} at={index + 1 + i} />
          )}
        />
      ) : (
        <Animated.View entering={FadeIn} style={styles.empty}>
          <Cat mood="groove" size={84} color={color} />
          <Text style={styles.emptyText}>
            The queue is empty. Radio keeps the music going.
          </Text>
        </Animated.View>
      )}
      <UndoBar />
    </View>
  );
}

const Row = memo(function Row({ track, at }: { track: Track; at: number }) {
  const drag = useReorderableDrag();
  const active = useIsActive();
  return (
    <SwipeRow
      right={{
        label: "Play next",
        color: "#2ED3A2",
        onCommit: () => player.move(at, usePlayerStore.getState().index + 1),
      }}
      left={{
        label: "Remove",
        color: "#FF4F6D",
        onCommit: () => removeWithUndo(track, at),
      }}
    >
      <Pressable
        onPress={() => {
          if (swipedRecently()) return;
          haptic.tick();
          player.skipTo(at);
        }}
        onLongPress={drag}
        delayLongPress={220}
        style={[styles.row, active && styles.rowActive]}
      >
        <Artwork thumbnails={track.thumbnails} size={48} radius={7} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {artistLine(track.artists)}
          </Text>
        </View>
        <Pressable hitSlop={8} onPressIn={drag} style={styles.handle}>
          <View style={styles.bar} />
          <View style={styles.bar} />
          <View style={styles.bar} />
        </Pressable>
      </Pressable>
    </SwipeRow>
  );
});

function UndoBar() {
  const removed = useUndo((s) => s.removed);
  const insets = useSafeAreaInsets();
  if (!removed) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      style={[styles.undo, { bottom: insets.bottom + 16 }]}
    >
      <Text style={styles.undoText} numberOfLines={1}>
        Removed “{removed.track.title}”
      </Text>
      <Pressable hitSlop={10} onPress={undoRemove}>
        <Text style={styles.undoAction}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

function Toggle({
  on,
  accent,
  label,
  icon,
  onPress,
}: {
  on: boolean;
  accent: string;
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      style={[styles.toggle, on ? { backgroundColor: accent } : {}]}
    >
      {icon}
      <Text style={[styles.tText, on && styles.tOn]} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 20, paddingTop: 12 },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  root: { flex: 1, backgroundColor: "#0E0E12" },
  now: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  kicker: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  nowTitle: { color: "#fff", fontSize: 19, fontWeight: "800", marginTop: 2 },
  nowSub: { color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 1 },
  controls: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  toggle: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  tText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  tOn: { color: "#000" },
  sheetTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginTop: 4 },
  listHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
  },
  section: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  from: { flex: 1, color: "rgba(255,255,255,0.45)", fontSize: 14 },
  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 40 },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 7,
    backgroundColor: "transparent",
  },
  rowActive: {
    backgroundColor: "#1E1E26",
    transform: [{ scale: 1.02 }],
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  handle: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  bar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  undo: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#2A2A31",
  },
  undoText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  undoAction: { color: "#8B7CFF", fontSize: 15, fontWeight: "800" },
});
