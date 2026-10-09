import { player } from "@pawse/player";
import { SectionList, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomSpace } from "../../components/page";
import { TrackRow } from "../../components/track-row";
import { CatState } from "../../components/ui";
import { historyByDay, useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { BackButton } from "./collection";

export default function HistoryPage() {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const history = useLibrary((s) => s.history);
  const days = historyByDay(history);
  return (
    <View style={styles.root}>
      <SectionList
        sections={days.map((d) => ({ title: dayLabel(d.date), data: d.plays }))}
        keyExtractor={(p) => `${p.track.id}${p.at}`}
        stickySectionHeadersEnabled
        contentContainerStyle={{
          paddingTop: insets.top + 52,
          paddingBottom: bottom,
        }}
        ListHeaderComponent={<Text style={styles.h1}>History</Text>}
        ListEmptyComponent={
          <CatState kind="empty" message="Songs you play show up here." />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.day}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <ReanimatedSwipeable
            renderRightActions={() => (
              <View style={styles.del}>
                <Text style={styles.delText}>Remove</Text>
              </View>
            )}
            onSwipeableOpen={() => {
              haptic.medium();
              useLibrary.getState().removeFromHistory(item.at);
            }}
          >
            <View style={{ backgroundColor: "#000" }}>
              <TrackRow
                track={item.track}
                removable
                subtitle={`${item.track.artists.map((a) => a.name).join(", ")} · ${new Date(item.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                onPress={() =>
                  void player.playRadio({
                    videoId: item.track.id,
                    title: item.track.title,
                  })
                }
              />
            </View>
          </ReanimatedSwipeable>
        )}
      />
      <BackButton />
    </View>
  );
}

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
  h1: {
    color: "#fff",
    fontSize: 34,
    ...display("800"),
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  day: {
    color: "#fff",
    fontSize: 15,
    ...display("800"),
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  del: {
    flex: 1,
    backgroundColor: "#FF4F6D",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  delText: { color: "#000", ...display("800") },
});
