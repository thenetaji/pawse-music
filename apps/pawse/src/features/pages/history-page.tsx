import type { Track } from "@pawse/music-core";
import { player } from "@pawse/player";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomSpace } from "../../components/page";
import { SwipeRow } from "../../components/swipe-row";
import { TrackRow } from "../../components/track-row";
import { CatState } from "../../components/ui";
import { historyByDay, useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { count } from "../../lib/plural";
import { display } from "../../lib/type";
import { BackButton } from "./collection";

export default function HistoryPage() {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const history = useLibrary((s) => s.history);
  const days = historyByDay(history);
  const songs = new Set(history.map((p) => p.track.id)).size;
  return (
    <View style={styles.root}>
      <SectionList
        sections={days.map((d) => ({
          title: dayLabel(d.date),
          data: bySong(d.plays),
        }))}
        keyExtractor={(r) => `${r.track.id}${r.at}`}
        stickySectionHeadersEnabled
        contentContainerStyle={{
          paddingTop: insets.top + 52,
          paddingBottom: bottom,
        }}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.h1}>History</Text>
            {history.length ? (
              <Text style={styles.sub}>
                {count(history.length, "play")} · {count(songs, "song")}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <CatState kind="empty" message="Songs you play show up here." />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.day}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <SwipeRow
            left={{
              label: "Remove",
              color: "#FF4F6D",
              onCommit: () => {
                haptic.medium();
                const gone = new Set(item.ats);
                useLibrary.setState((st) => ({
                  history: st.history.filter((p) => !gone.has(p.at)),
                }));
              },
            }}
          >
            <TrackRow
              track={item.track}
              removable
              subtitle={[
                // The lead artist only, so the time and play count stay visible.
                item.track.artists[0]?.name,
                time(item.at),
                item.ats.length > 1 ? `${item.ats.length} plays` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              onPress={() =>
                void player.playRadio({
                  videoId: item.track.id,
                  title: item.track.title,
                })
              }
            />
          </SwipeRow>
        )}
      />
      <BackButton />
    </View>
  );
}

type Row = { track: Track; at: number; ats: number[] };

// One row per song per day, at its latest play, so repeats don't fill the list.
function bySong(plays: { track: Track; at: number }[]): Row[] {
  const rows = new Map<string, Row>();
  for (const p of plays) {
    const row = rows.get(p.track.id);
    if (row) row.ats.push(p.at);
    else rows.set(p.track.id, { track: p.track, at: p.at, ats: [p.at] });
  }
  return [...rows.values()];
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function dayLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  head: { paddingHorizontal: 20, marginBottom: 10 },
  h1: {
    color: "#fff",
    fontSize: 34,
    ...display("800"),
    letterSpacing: -0.8,
  },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 2 },
  day: {
    color: "#fff",
    fontSize: 15,
    ...display("800"),
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
});
