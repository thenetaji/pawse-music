import { player } from "@pawse/player";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import {
  DownloadOptions,
  formatBytes,
} from "../../components/download-options";
import { CatState, Chip, PressScale } from "../../components/ui";
import {
  removeAllDownloads,
  removeDownload,
  retryDownloads,
  useCached,
  useDownloads,
  useOnline,
} from "../../data/downloads";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";

export default function DownloadsPage() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const online = useOnline();
  const { list, totalBytes, active } = useDownloads();
  const cached = useCached();
  const [tab, setTab] = useState<"downloads" | "kept">("downloads");
  const done = list.filter((d) => d.state === "done");
  const failed = list.filter((d) => d.state === "error").length;
  const kept = cached.list.map((c) => c.track);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.h1}>Downloads</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.summary}>
        <Text style={styles.sumText}>
          {done.length} songs · {formatBytes(totalBytes)}
          {active ? ` · ${active} saving` : ""}
          {!online ? " · Offline" : ""}
        </Text>
      </View>
      <View style={styles.tabs}>
        <Chip
          label={`Downloads ${done.length}`}
          on={tab === "downloads"}
          accent={accent}
          onPress={() => setTab("downloads")}
        />
        <Chip
          label={`Kept offline ${kept.length}`}
          on={tab === "kept"}
          accent={accent}
          onPress={() => setTab("kept")}
        />
      </View>
      {tab === "kept" ? (
        <FlatList
          data={cached.list}
          keyExtractor={(c) => c.track.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={
            <Text style={styles.note}>
              Songs you finish are kept here ({formatBytes(cached.bytes)}), so
              your favourites play without internet. The least played go first
              when space runs out.
            </Text>
          }
          ListEmptyComponent={
            <CatState
              kind="empty"
              message="Nothing kept yet. Finish a few songs on Wi-Fi."
            />
          }
          ListFooterComponent={<DownloadOptions />}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() =>
                void player.play(kept, index, {
                  source: { type: "library", title: "Kept offline" },
                })
              }
              style={styles.row}
            >
              <Artwork
                thumbnails={item.track.thumbnails}
                size={50}
                radius={7}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.track.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.track.artists.map((a) => a.name).join(", ")} ·{" "}
                  {formatBytes(item.bytes)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      ) : null}
      {tab === "downloads" && list.length ? (
        <View style={styles.actions}>
          <PressScale
            onPress={() =>
              done.length &&
              void player.play(
                done.map((d) => d.track),
                0,
                { source: { type: "library", title: "Downloads" } },
              )
            }
            style={[styles.btn, { backgroundColor: "#fff" }]}
          >
            <Text style={[styles.btnText, { color: "#000" }]}>Play all</Text>
          </PressScale>
          {failed ? (
            <PressScale onPress={retryDownloads} style={styles.btn}>
              <Text style={styles.btnText}>Retry {failed}</Text>
            </PressScale>
          ) : (
            <PressScale
              onPress={() =>
                showSheet({
                  actions: [
                    {
                      label: "Delete all downloads",
                      destructive: true,
                      onPress: removeAllDownloads,
                    },
                  ],
                })
              }
              style={styles.btn}
            >
              <Text style={styles.btnText}>Delete all</Text>
            </PressScale>
          )}
        </View>
      ) : null}
      {tab === "downloads" ? (
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListFooterComponent={<DownloadOptions />}
          ListEmptyComponent={
            <CatState
              kind="empty"
              message="Tap the download button on any song, album or playlist to keep it for offline."
            />
          }
          renderItem={({ item }) => (
            <ReanimatedSwipeable
              renderRightActions={() => (
                <View style={styles.del}>
                  <Text style={styles.delText}>Delete</Text>
                </View>
              )}
              onSwipeableOpen={() => {
                haptic.medium();
                removeDownload(item.id);
              }}
            >
              <Pressable
                onPress={() =>
                  item.state === "done" &&
                  void player.play(
                    done.map((d) => d.track),
                    Math.max(
                      0,
                      done.findIndex((d) => d.id === item.id),
                    ),
                    { source: { type: "library", title: "Downloads" } },
                  )
                }
                style={styles.row}
              >
                <Artwork
                  thumbnails={item.track.thumbnails}
                  size={50}
                  radius={7}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.track.title}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.state === "done"
                      ? formatBytes(item.bytes)
                      : item.state === "error"
                        ? "Failed"
                        : item.state === "queued"
                          ? "Waiting"
                          : `${Math.round(item.progress * 100)}%`}
                  </Text>
                  {item.state === "downloading" ? (
                    <View style={styles.bar}>
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${item.progress * 100}%`,
                            backgroundColor: accent,
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            </ReanimatedSwipeable>
          )}
        />
      ) : null}
    </View>
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
  summary: { paddingHorizontal: 20, marginTop: 4 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginTop: 14 },
  note: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sumText: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  btnText: { color: "#fff", fontSize: 15, ...display("800") },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: "#000",
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 },
  bar: {
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  fill: { height: 3 },
  del: {
    flex: 1,
    backgroundColor: "#FF4F6D",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  delText: { color: "#000", ...display("800") },
});
