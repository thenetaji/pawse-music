import { player } from "@pawse/player";
import { Image } from "expo-image";
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
import { clock } from "../../components/video-card";
import {
  type DownloadRow,
  localArtwork,
  removeAllDownloads,
  removeDownload,
  retryDownloads,
  useCached,
  useDownloads,
  useOnline,
  useVideoDownloads,
  videoDownloadHeight,
} from "../../data/downloads";
import { hasMouse, rightClick } from "../../lib/context-menu";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { display } from "../../lib/type";
import { showTrackActions } from "../library/track-actions";
import { MoreGlyph } from "../now-playing/icons";
import { useAccent } from "../now-playing/now-palette";

export default function DownloadsPage() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const online = useOnline();
  const { list: all, totalBytes, active } = useDownloads();
  const pictures = useVideoDownloads();
  const cached = useCached();
  // A video is its sound plus its picture: one row, with both counted.
  const videos = all
    .filter((d) => pictures[d.id])
    .map((d) => combine(d, pictures[d.id]));
  const songs = all.filter((d) => !pictures[d.id]);
  const [picked, setTab] = useState<"downloads" | "videos" | "kept">();
  const tab =
    picked ?? (songs.length || !videos.length ? "downloads" : "videos");
  const list = tab === "videos" ? videos : songs;
  const done = list.filter((d) => d.state === "done");
  const failed = [...songs, ...videos].filter(
    (d) => d.state === "error",
  ).length;
  const saving =
    active +
    Object.values(pictures).filter(
      (p) => p.state === "downloading" || p.state === "queued",
    ).length;
  const bytes =
    totalBytes + Object.values(pictures).reduce((n, p) => n + p.bytes, 0);
  const kept = cached.list.map((c) => c.track);
  const playAt = (id: string) => {
    const i = done.findIndex((d) => d.id === id);
    if (i < 0) return;
    void player.play(
      done.map((d) => d.track),
      i,
      { source: { type: "library", title: "Downloads" } },
    );
    // Videos open the player on their picture, so you see what you saved.
    if (tab === "videos") push("/now-playing");
  };
  // The swipe-to-delete, as a menu: right-click or "⋯" on computers.
  const rowMenu = (item: (typeof list)[number]) =>
    showSheet({
      header: (
        <View style={styles.menuHead}>
          <Artwork thumbnails={item.track.thumbnails} size={44} radius={7} />
          <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
            {item.track.title}
          </Text>
        </View>
      ),
      actions: [
        ...(item.state === "done"
          ? [{ label: "Play", onPress: () => playAt(item.id) }]
          : []),
        {
          label: tab === "videos" ? "Video options" : "Song options",
          keepOpen: true,
          onPress: () => showTrackActions(item.track),
        },
        {
          label: "Delete download",
          destructive: true,
          onPress: () => removeDownload(item.id),
        },
      ],
    });

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
          {[
            count(songs.filter((d) => d.state === "done").length, "song"),
            videos.length
              ? count(videos.filter((d) => d.state === "done").length, "video")
              : "",
            formatBytes(bytes),
            saving ? `${saving} saving` : "",
            !online ? "Offline" : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View style={styles.tabs}>
        <Chip
          label={`Songs ${songs.length}`}
          on={tab === "downloads"}
          accent={accent}
          onPress={() => setTab("downloads")}
        />
        {videos.length ? (
          <Chip
            label={`Videos ${videos.length}`}
            on={tab === "videos"}
            accent={accent}
            onPress={() => setTab("videos")}
          />
        ) : null}
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
      {tab !== "kept" && list.length ? (
        <View style={styles.actions}>
          <PressScale
            onPress={() => done.length && playAt(done[0].id)}
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
      {tab !== "kept" ? (
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListFooterComponent={<DownloadOptions />}
          ListEmptyComponent={
            <CatState
              kind="empty"
              message={
                tab === "videos"
                  ? "Download a video from its ⋯ menu to watch it offline."
                  : "Tap the download button on any song, album or playlist to keep it for offline."
              }
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
                onPress={() => playAt(item.id)}
                onLongPress={() => rowMenu(item)}
                {...rightClick(() => rowMenu(item))}
                style={styles.row}
              >
                {tab === "videos" ? (
                  <VideoThumb item={item} online={online} />
                ) : (
                  <Artwork
                    thumbnails={item.track.thumbnails}
                    size={50}
                    radius={7}
                  />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={styles.title}
                    numberOfLines={tab === "videos" ? 2 : 1}
                  >
                    {item.track.title}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.state === "done"
                      ? [
                          tab === "videos"
                            ? `${videoDownloadHeight(item.id)}p`
                            : item.track.artists.map((a) => a.name).join(", "),
                          formatBytes(item.bytes),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : item.state === "error"
                        ? "Failed"
                        : item.state === "queued"
                          ? "Waiting"
                          : `Saving ${Math.round(item.progress * 100)}%`}
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
                {hasMouse ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => rowMenu(item)}
                    accessibilityLabel="More"
                    style={styles.more}
                  >
                    <MoreGlyph size={18} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                ) : null}
              </Pressable>
            </ReanimatedSwipeable>
          )}
        />
      ) : null}
    </View>
  );
}

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** A video's sound and picture as one row: both sizes, one state, progress weighted by the picture. */
function combine(sound: DownloadRow, picture: DownloadRow): DownloadRow {
  const states = [sound.state, picture.state];
  return {
    ...sound,
    bytes: sound.bytes + picture.bytes,
    state: states.includes("error")
      ? "error"
      : states.every((x) => x === "done")
        ? "done"
        : states.includes("downloading")
          ? "downloading"
          : "queued",
    progress: sound.progress * 0.15 + picture.progress * 0.85,
  };
}

function VideoThumb({ item, online }: { item: DownloadRow; online: boolean }) {
  const web = `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`;
  const uri = online ? web : (localArtwork(item.id) ?? web);
  const length = clock(item.track.durationSec);
  return (
    <View style={styles.thumb}>
      <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" />
      {length ? <Text style={styles.badge}>{length}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 128,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#16151b",
  },
  badge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: "hidden",
    color: "#fff",
    fontSize: 11,
    backgroundColor: "rgba(0,0,0,0.72)",
    ...display("700"),
  },
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
  menuHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  more: { paddingHorizontal: 6, paddingVertical: 8 },
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
