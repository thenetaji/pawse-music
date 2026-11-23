import { artistLine, type Track } from "@pawse/music-core";
import { player, usePlayerState, usePlayerStore } from "@pawse/player";
import { router } from "expo-router";
import { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
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
import { showPlaylistPicker } from "../features/library/playlist-tools";
import { ColorField } from "../features/now-playing/color-field";
import { MoreGlyph } from "../features/now-playing/icons";
import { useAccent, useNowPalette } from "../features/now-playing/now-palette";
import { ShuffleGlyph } from "../features/pages/collection";
import { hasMouse, rightClick } from "../lib/context-menu";
import { haptic } from "../lib/haptics";
import { useAutoplayOn, useSetting } from "../lib/settings";
import {
  setSmoothShuffle,
  toggleShuffle,
  useShuffleOn,
  useSmoothShuffle,
} from "../lib/smooth-queue";
import { display } from "../lib/type";

const SLEEP = [15, 30, 45, 60, 90];
const UNDO_MS = 4000;

// The last queue change, offered back for a few seconds.
type Undo = {
  message: string;
  revert: () => void;
  timer: ReturnType<typeof setTimeout>;
};
const useUndo = create<{ last: Undo | null }>(() => ({ last: null }));

function offerUndo(message: string, revert: () => void) {
  const prev = useUndo.getState().last;
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => useUndo.setState({ last: null }), UNDO_MS);
  useUndo.setState({ last: { message, revert, timer } });
}

function removeWithUndo(track: Track, at: number) {
  player.remove(at);
  offerUndo(`Removed “${track.title}”`, () => {
    player.addNext(track);
    const next = usePlayerStore.getState().index + 1;
    if (at !== next) player.move(next, at);
  });
}

function playNextWithUndo(track: Track, at: number) {
  const next = usePlayerStore.getState().index + 1;
  if (at === next) return;
  player.move(at, next);
  offerUndo(`“${track.title}” plays next`, () => {
    const now = usePlayerStore.getState().index + 1;
    if (usePlayerStore.getState().tracks[now]?.id === track.id)
      player.move(now, at);
  });
}

function undoLast() {
  const u = useUndo.getState().last;
  if (!u) return;
  clearTimeout(u.timer);
  useUndo.setState({ last: null });
  haptic.light();
  u.revert();
}

export default function Queue() {
  const { queue, index, repeat, sleepAt, status, source, radio, endless } =
    usePlayerState();
  const autoplaySetting = useAutoplayOn();
  const autoplay = radio || (endless ?? autoplaySetting);
  const shuffle = useShuffleOn();
  const smooth = useSmoothShuffle();
  const accent = useAccent();
  const palette = useNowPalette((s) => s.palette);
  const color = useSetting<CatColor>("catColor", "orange");
  const current = queue[index];
  const upNext = useMemo(() => queue.slice(index + 1), [queue, index]);
  const sleepLabel =
    sleepAt === "endOfTrack"
      ? "End of song"
      : sleepAt
        ? new Date(sleepAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "Sleep";

  // Reordering only reacts to vertical drags, so sideways swipes reach the rows.
  const listPan = useMemo(() => Gesture.Pan().activeOffsetY([-10, 10]), []);

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
          onPress={toggleShuffle}
        />
        <Toggle
          on={smooth}
          accent={accent}
          label="Smooth"
          onPress={() => setSmoothShuffle(!smooth)}
        />
        <Toggle
          on={autoplay}
          accent={accent}
          label="∞"
          a11y={autoplay ? "Autoplay on" : "Autoplay off"}
          narrow
          onPress={() => {
            haptic.tick();
            player.setAutoplay(!autoplay);
          }}
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

      <ReorderableList
        data={upNext}
        // Keyed by place in the whole queue, so playing a song from the list keeps the rows after it instead of rebuilding every one.
        keyExtractor={(t, i) => `${t.id}:${index + 1 + i}`}
        onReorder={onReorder}
        panGesture={listPan}
        shouldUpdateActiveItem
        contentContainerStyle={{ paddingBottom: 60 }}
        ListHeaderComponent={
          <>
            <History queue={queue} index={index} accent={accent} />
            <View style={styles.listHead}>
              <Text style={styles.section}>Up next</Text>
              <Text style={styles.from} numberOfLines={1}>
                {source?.title ? `from ${source.title}` : ""}
              </Text>
              {queue.length - index > 1 ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => showPlaylistPicker(queue.slice(index))}
                >
                  <Text style={[styles.save, { color: accent }]}>Save</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        }
        ListEmptyComponent={
          <Animated.View entering={FadeIn} style={styles.empty}>
            <Cat mood="groove" size={84} color={color} />
            <Text style={styles.emptyText}>
              {autoplay
                ? "Similar songs play when this one ends."
                : "Nothing after this song. Turn on ∞ to keep playing similar songs."}
            </Text>
          </Animated.View>
        }
        renderItem={({ item, index: i }) => (
          <Row track={item} at={index + 1 + i} />
        )}
      />
      <UndoBar />
    </View>
  );
}

// What the row's swipes do, as a menu: right-click or "⋯" on computers.
function showRowMenu(track: Track, at: number) {
  haptic.light();
  showSheet({
    header: (
      <View style={styles.menuHead}>
        <Artwork thumbnails={track.thumbnails} size={44} radius={7} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {artistLine(track.artists)}
          </Text>
        </View>
      </View>
    ),
    actions: [
      { label: "Play now", onPress: () => player.skipTo(at) },
      { label: "Play next", onPress: () => playNextWithUndo(track, at) },
      {
        label: "Add to playlist",
        keepOpen: true,
        onPress: () => showPlaylistPicker([track]),
      },
      {
        label: "Remove from queue",
        destructive: true,
        onPress: () => removeWithUndo(track, at),
      },
    ],
  });
}

const Row = memo(function Row({ track, at }: { track: Track; at: number }) {
  const drag = useReorderableDrag();
  const active = useIsActive();
  return (
    <SwipeRow
      right={{
        label: "Play next",
        color: "#2ED3A2",
        onCommit: () => playNextWithUndo(track, at),
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
        {...rightClick(() => showRowMenu(track, at))}
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
        {hasMouse ? (
          <Pressable
            hitSlop={8}
            onPress={() => showRowMenu(track, at)}
            accessibilityLabel="More"
            style={styles.handle}
          >
            <MoreGlyph size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>
        ) : null}
        <Pressable hitSlop={8} onPressIn={drag} style={styles.handle}>
          <View style={styles.bar} />
          <View style={styles.bar} />
          <View style={styles.bar} />
        </Pressable>
      </Pressable>
    </SwipeRow>
  );
});

// Songs heard before the one playing, newest first; tap one to hear it again.
function History({
  queue,
  index,
  accent,
}: {
  queue: Track[];
  index: number;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  if (!index) return null;
  const heard = queue
    .slice(0, index)
    .map((track, at) => ({ track, at }))
    .reverse();
  return (
    <View>
      <View style={styles.listHead}>
        <Pressable
          hitSlop={10}
          onPress={() => {
            haptic.tick();
            setOpen(!open);
          }}
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.section}>
            History{" "}
            <Text style={styles.from}>
              {heard.length} {heard.length === 1 ? "song" : "songs"}{" "}
              {open ? "▾" : "▸"}
            </Text>
          </Text>
        </Pressable>
        {open ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              haptic.light();
              player.clearHistory();
              setOpen(false);
            }}
          >
            <Text style={[styles.save, { color: accent }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {open
        ? heard.map(({ track, at }) => (
            <Pressable
              key={`${track.id}:${at}`}
              onPress={() => {
                haptic.tick();
                player.skipTo(at);
              }}
              {...rightClick(() => showRowMenu(track, at))}
              onLongPress={() => showRowMenu(track, at)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPast]}
            >
              <Artwork thumbnails={track.thumbnails} size={48} radius={7} />
              <View style={styles.text}>
                <Text style={[styles.title, styles.past]} numberOfLines={1}>
                  {track.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {artistLine(track.artists)}
                </Text>
              </View>
            </Pressable>
          ))
        : null}
    </View>
  );
}

function UndoBar() {
  const last = useUndo((s) => s.last);
  const insets = useSafeAreaInsets();
  if (!last) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      style={[styles.undo, { bottom: insets.bottom + 16 }]}
    >
      <Text style={styles.undoText} numberOfLines={1}>
        {last.message}
      </Text>
      <Pressable hitSlop={10} onPress={undoLast}>
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
  a11y,
  narrow,
  onPress,
}: {
  on: boolean;
  accent: string;
  label: string;
  icon?: React.ReactNode;
  a11y?: string;
  narrow?: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={a11y}
      style={[
        styles.toggle,
        narrow && styles.narrow,
        on ? { backgroundColor: accent } : {},
      ]}
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
  headTitle: { color: "#fff", fontSize: 20, ...display("800") },
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
    ...display("800"),
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  nowTitle: { color: "#fff", fontSize: 19, ...display("800"), marginTop: 2 },
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
  narrow: { flex: 0, width: 48 },
  tText: { color: "#fff", fontSize: 14, ...display("700") },
  tOn: { color: "#000" },
  sheetTitle: { color: "#fff", fontSize: 17, ...display("700"), marginTop: 4 },
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
    ...display("800"),
    letterSpacing: -0.3,
  },
  from: { flex: 1, color: "rgba(255,255,255,0.45)", fontSize: 14 },
  save: { fontSize: 15, ...display("800") },
  menuHead: { flexDirection: "row", alignItems: "center", gap: 12 },
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
    elevation: 8,
  },
  rowPast: { backgroundColor: "rgba(255,255,255,0.06)" },
  past: { color: "rgba(255,255,255,0.75)" },
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
  undoAction: { color: "#8B7CFF", fontSize: 15, ...display("800") },
});
