import { artistLine } from "@studio/music-core";
import { player, usePlayerState } from "@studio/player";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { showSheet } from "../components/action-sheet";
import { Artwork } from "../components/artwork";
import { EqBars } from "../components/eq-bars";
import { ShuffleGlyph } from "../features/pages/collection";
import { useAccent } from "../features/now-playing/now-palette";

const SLEEP = [15, 30, 45, 60];

export default function Queue() {
  const { queue, index, shuffle, repeat, sleepAt, status } = usePlayerState();
  const accent = useAccent();
  const upNext = queue.slice(index + 1);
  const sleepLabel =
    sleepAt === "endOfTrack"
      ? "End of song"
      : sleepAt
        ? `Until ${new Date(sleepAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Sleep";

  return (
    <View style={{ flex: 1, backgroundColor: "#121216" }}>
      <View style={styles.controls}>
        <Toggle
          on={shuffle}
          accent={accent}
          onPress={() => player.setShuffle(!shuffle)}
        >
          <ShuffleGlyph color={shuffle ? "#000" : "#fff"} />
          <Text style={[styles.tText, shuffle && styles.tOn]}>Shuffle</Text>
        </Toggle>
        <Toggle
          on={repeat !== "off"}
          accent={accent}
          onPress={() =>
            player.setRepeat(
              repeat === "off" ? "all" : repeat === "all" ? "one" : "off",
            )
          }
        >
          <Text style={[styles.tText, repeat !== "off" && styles.tOn]}>
            {repeat === "one" ? "Repeat one" : "Repeat"}
          </Text>
        </Toggle>
        <Toggle
          on={!!sleepAt}
          accent={accent}
          onPress={() =>
            showSheet({
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
        >
          <Text style={[styles.tText, !!sleepAt && styles.tOn]}>
            {sleepLabel}
          </Text>
        </Toggle>
      </View>

      <FlatList
        data={upNext}
        keyExtractor={(t, i) => `${t.id}${i}`}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {queue[index] ? (
              <>
                <Text style={styles.section}>Now playing</Text>
                <View style={styles.row}>
                  <Artwork
                    thumbnails={queue[index].thumbnails}
                    size={48}
                    radius={7}
                  />
                  <View style={styles.text}>
                    <Text
                      style={[styles.title, { color: accent }]}
                      numberOfLines={1}
                    >
                      {queue[index].title}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {artistLine(queue[index].artists)}
                    </Text>
                  </View>
                  <EqBars color={accent} playing={status === "playing"} />
                </View>
              </>
            ) : null}
            <Text style={styles.section}>Up next</Text>
            {!upNext.length ? (
              <Text style={styles.empty}>
                Radio keeps going when this runs out.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item, index: i }) => {
          const at = index + 1 + i;
          return (
            <Pressable
              onPress={() => player.skipTo(at)}
              onLongPress={() =>
                showSheet({
                  actions: [
                    {
                      label: "Play next",
                      onPress: () => player.move(at, index + 1),
                    },
                    {
                      label: "Move to end",
                      onPress: () => player.move(at, queue.length - 1),
                    },
                    {
                      label: "Remove",
                      destructive: true,
                      onPress: () => player.remove(at),
                    },
                  ],
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: "rgba(255,255,255,0.06)" },
              ]}
            >
              <Artwork thumbnails={item.thumbnails} size={48} radius={7} />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {artistLine(item.artists)}
                </Text>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => player.remove(at)}
                style={styles.remove}
              >
                <Text style={styles.removeText}>−</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function Toggle({
  on,
  accent,
  onPress,
  children,
}: {
  on: boolean;
  accent: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, on && { backgroundColor: accent }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 6,
  },
  toggle: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  tText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  tOn: { color: "#000" },
  section: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    paddingHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
  },
  empty: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  removeText: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: -2 },
});
