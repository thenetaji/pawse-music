import { bestThumbnail, type Thumbnail, type Track } from "@pawse/music-core";
import { player, type QueueSource } from "@pawse/player";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { askText, showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import {
  ArrowDown,
  ArrowUp,
  CheckGlyph,
  CopyGlyph,
  ImportGlyph,
  MinusGlyph,
  PencilGlyph,
  PinGlyph,
  PlaylistGlyph,
  RefreshGlyph,
  TrashGlyph,
} from "../../components/glyphs";
import { useBottomSpace } from "../../components/page";
import { showToast } from "../../components/toast";
import { TrackRow } from "../../components/track-row";
import { PressScale } from "../../components/ui";
import { downloadMany, useDownloads } from "../../data/downloads";
import { importPlaylist, useLibrary } from "../../data/library";
import { useListSpot } from "../../data/list-spots";
import { isPinned, togglePin } from "../../data/pins";
import { isUnfinished, useWatched } from "../../data/watched";
import { haptic } from "../../lib/haptics";
import { count } from "../../lib/plural";
import { autoplayMode } from "../../lib/settings";
import { display } from "../../lib/type";
import {
  removeDuplicates,
  showMergeSheet,
  showPlaylistPicker,
  showSortSheet,
} from "../library/playlist-tools";
import { MoreGlyph, PlayGlyph } from "../now-playing/icons";
import { readable } from "../now-playing/now-palette";
import { useArtworkPalette } from "../now-playing/use-artwork-palette";
import { openWatch } from "../watch/store";
import { TopGlow } from "./top-glow";

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  thumbnails: Thumbnail[];
  tracks: Track[];
  source: QueueSource;
  numbered?: boolean;
  footer?: ReactNode;
  onEndReached?: () => void;
  /** Pull to refresh, e.g. a YouTube playlist edited on YouTube. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Heart button state for albums and remote playlists. */
  saved?: boolean;
  onSave?: () => void;
  /** Local playlists can be renamed and edited. */
  editableId?: string;
};

// Album and playlist pages: the cover's colours wash the top; the cover shrinks and fades as you scroll.
export function Collection({
  title,
  subtitle,
  meta,
  thumbnails,
  tracks,
  source,
  numbered,
  footer,
  onEndReached,
  onRefresh,
  refreshing,
  saved,
  onSave,
  editableId,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const palette = useArtworkPalette(bestThumbnail(thumbnails, 120));
  const [editing, setEditing] = useState(false);
  // Row positions picked in select mode; null when not selecting.
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const downloads = useDownloads();
  const doneIds = new Set(
    downloads.list.filter((d) => d.state === "done").map((d) => d.id),
  );
  const allDown = tracks.length > 0 && tracks.every((t) => doneIds.has(t.id));
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const coverStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(y.value, [-150, 0, 220], [1.18, 1, 0.82], "clamp") },
      { translateY: interpolate(y.value, [0, 220], [0, 40], "clamp") },
    ],
    opacity: interpolate(y.value, [0, 240], [1, 0.3], "clamp"),
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [300, 360], [0, 1], "clamp"),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [230, 300], [1, 0], "clamp"),
  }));

  const play = (i: number, shuffle = false) => {
    haptic.light();
    player.setShuffle(shuffle);
    // Playlists and albums end where they end unless the user asked for more.
    void player.play(tracks, i, {
      source,
      endless: autoplayMode() === "always",
    });
  };
  // A YouTube playlist of videos (a course, a series) is watched, in order, not listened to.
  const videoList =
    tracks.length > 0 &&
    tracks.filter((t) => t.kind === "video").length * 2 > tracks.length;
  const listId = source.id ?? `title:${title}`;
  const watch = (i: number) => {
    const t = tracks[i];
    if (!t) return;
    haptic.light();
    const seed = (x: Track) => ({
      id: x.id,
      title: x.title,
      thumbnails: x.thumbnails,
      channel: x.artists[0] && {
        id: x.artists[0].id,
        name: x.artists[0].name,
      },
    });
    openWatch(seed(t), undefined, {
      list: { id: listId, title, items: tracks.map(seed) },
    });
  };
  const start = (i: number) => (videoList ? watch(i) : play(i));
  // Where you stopped last time; Resume picks up there.
  const spot = useListSpot(listId);
  const spotAt = spot ? tracks.findIndex((t) => t.id === spot.id) : -1;
  const spotWatch = useWatched((s) =>
    videoList && spot ? s.list.find((w) => w.id === spot.id) : undefined,
  );
  // A video you finished sends Resume on to the one after it; finishing the last starts over.
  const finished = !!spotWatch && spotWatch.pos > 5 && !isUnfinished(spotWatch);
  const resumeAt = !finished
    ? spotAt
    : spotAt + 1 < tracks.length
      ? spotAt + 1
      : -1;
  const canResume =
    resumeAt > 0 || (resumeAt === 0 && !!spotWatch && !finished);

  const own =
    editableId ?? (source.type === "playlist" ? source.id : undefined);
  // A playlist copied from YouTube remembers where it came from, so it can be pulled again.
  const sourceId = useLibrary((s) =>
    editableId
      ? s.playlists.find((p) => p.id === editableId)?.sourceId
      : undefined,
  );
  const removePicked = () => {
    if (!editableId || !picked?.size) return;
    const ids = tracks.filter((_, i) => picked.has(i)).map((t) => t.id);
    useLibrary.getState().removeManyFromPlaylist(editableId, ids);
    haptic.success();
    showToast(`Removed ${count(ids.length, "song")}`);
    setPicked(null);
  };
  // The YouTube copy replaces this one, so songs added only in Pawse go: ask first.
  const reimport = (id: string) =>
    Alert.alert(
      "Update from YouTube?",
      "This playlist will match YouTube's copy. Songs you added only in Pawse will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update",
          onPress: () => {
            showToast("Updating from YouTube…");
            importPlaylist(id).then(
              () => showToast(`${title} is up to date`),
              () =>
                showToast("Couldn't reach YouTube. Try again later.", {
                  bad: true,
                }),
            );
          },
        },
      ],
    );
  const toggle = (i: number) => {
    haptic.tick();
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  };
  const menu = () => {
    haptic.light();
    showSheet({
      header: (
        <View>
          <Text style={styles.menuTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.menuSub}>{count(tracks.length, "song")}</Text>
        </View>
      ),
      actions: [
        ...(source.id && source.type !== "radio"
          ? [
              {
                label: isPinned(source.id) ? "Unpin from Home" : "Pin to Home",
                icon: (c: string) => (
                  <PinGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () =>
                  togglePin({
                    kind: source.type === "album" ? "album" : "playlist",
                    id: source.id ?? "",
                    title,
                    thumbnails,
                  }),
              },
            ]
          : []),
        ...(tracks.length
          ? [
              {
                label: "Add all to a playlist",
                keepOpen: true,
                icon: (c: string) => (
                  <PlaylistGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () => showPlaylistPicker(tracks, { exclude: own }),
              },
              {
                label: "Select songs",
                icon: (c: string) => (
                  <CheckGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () => {
                  setEditing(false);
                  setPicked(new Set());
                },
              },
            ]
          : []),
        ...(editableId
          ? [
              {
                label: "Rename",
                keepOpen: true,
                icon: (c: string) => (
                  <PencilGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () =>
                  askText({
                    title: "Rename playlist",
                    placeholder: title,
                    initial: title,
                    confirm: "Save",
                    onSubmit: (name) =>
                      useLibrary.getState().renamePlaylist(editableId, name),
                  }),
              },
              {
                label: "Sort",
                keepOpen: true,
                icon: (c: string) => (
                  <ArrowDown size={22} weight={1.8} color={c} />
                ),
                onPress: () => showSortSheet(editableId),
              },
              {
                label: "Merge another playlist in",
                keepOpen: true,
                icon: (c: string) => (
                  <ImportGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () => showMergeSheet(editableId),
              },
              {
                label: "Remove repeats",
                icon: (c: string) => (
                  <MinusGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () => removeDuplicates(editableId),
              },
              ...(sourceId
                ? [
                    {
                      label: "Update from YouTube",
                      icon: (c: string) => (
                        <RefreshGlyph size={22} weight={1.8} color={c} />
                      ),
                      onPress: () => reimport(sourceId),
                    },
                  ]
                : []),
              {
                label: "Duplicate",
                icon: (c: string) => (
                  <CopyGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () => {
                  const copy = useLibrary
                    .getState()
                    .duplicatePlaylist(editableId);
                  if (copy) showToast(`Made ${title} copy`);
                },
              },
              {
                label: "Delete playlist",
                destructive: true,
                icon: (c: string) => (
                  <TrashGlyph size={22} weight={1.8} color={c} />
                ),
                onPress: () =>
                  confirmDelete(title, () => {
                    useLibrary.getState().deletePlaylist(editableId);
                    router.back();
                  }),
              },
            ]
          : []),
      ],
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Animated.FlatList
        data={tracks}
        extraData={picked}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(t, i) => `${t.id}${i}`}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              tintColor="#fff"
              refreshing={!!refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: bottom }}
        ListHeaderComponent={
          <View>
            <TopGlow
              height={720}
              colors={[palette.colors[0], palette.colors[2]]}
            />
            <View style={[styles.hero, { paddingTop: insets.top + 50 }]}>
              <Animated.View style={[styles.cover, coverStyle]}>
                <Artwork thumbnails={thumbnails} size={236} radius={16} />
              </Animated.View>
              {editing && editableId ? (
                <TextInput
                  defaultValue={title}
                  onEndEditing={(e) =>
                    useLibrary
                      .getState()
                      .renamePlaylist(
                        editableId,
                        e.nativeEvent.text.trim() || title,
                      )
                  }
                  style={[styles.title, styles.titleInput]}
                  selectionColor={palette.accent}
                />
              ) : (
                <Animated.Text
                  style={[styles.title, titleStyle]}
                  numberOfLines={2}
                >
                  {title}
                </Animated.Text>
              )}
              {subtitle ? (
                <Text
                  style={[styles.subtitle, { color: readable(palette.accent) }]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              ) : null}
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
              {tracks.length ? (
                <View style={styles.actions}>
                  <IconBtn
                    label={allDown ? "Downloaded" : "Download"}
                    onPress={() => {
                      haptic.medium();
                      downloadMany(tracks);
                    }}
                  >
                    <DownloadGlyph done={allDown} />
                  </IconBtn>
                  <PressScale
                    disabled={!tracks.length}
                    onPress={() => start(canResume ? resumeAt : 0)}
                    style={[styles.btn, styles.primary]}
                  >
                    <PlayGlyph size={18} color="#000" />
                    <Text style={[styles.btnText, { color: "#000" }]}>
                      {canResume ? "Resume" : videoList ? "Watch" : "Play"}
                    </Text>
                  </PressScale>
                  <PressScale
                    disabled={!tracks.length}
                    onPress={() =>
                      play(Math.floor(Math.random() * tracks.length), true)
                    }
                    style={styles.btn}
                  >
                    <ShuffleGlyph />
                    <Text style={styles.btnText}>Shuffle</Text>
                  </PressScale>
                  {editableId ? (
                    <IconBtn
                      label={editing ? "Done" : "Edit"}
                      onPress={() => setEditing((e) => !e)}
                    >
                      <Text style={styles.editText}>
                        {editing ? "Done" : "Edit"}
                      </Text>
                    </IconBtn>
                  ) : onSave ? (
                    <IconBtn
                      label="Save"
                      onPress={() => {
                        haptic.success();
                        onSave();
                      }}
                    >
                      <HeartOutline
                        filled={!!saved}
                        color={saved ? readable(palette.accent) : "#fff"}
                      />
                    </IconBtn>
                  ) : null}
                </View>
              ) : null}
              {canResume ? (
                <Text style={styles.spot} numberOfLines={1}>
                  {finished ? "Next up" : "Stopped at"}:{" "}
                  {tracks[resumeAt]?.title}
                  {"  ·  "}
                  <Text style={styles.startOver} onPress={() => start(0)}>
                    Start over
                  </Text>
                </Text>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item, index }) =>
          picked ? (
            <PickRow
              track={item}
              on={picked.has(index)}
              accent={readable(palette.accent)}
              onPress={() => toggle(index)}
            />
          ) : editing && editableId ? (
            <EditRow
              track={item}
              index={index}
              count={tracks.length}
              id={editableId}
            />
          ) : (
            <TrackRow
              track={item}
              index={index + 1}
              showArt={!numbered}
              onPress={() => start(index)}
              subtitle={
                numbered
                  ? item.artists.map((a) => a.name).join(", ")
                  : undefined
              }
            />
          )
        }
        ListFooterComponent={footer ? <View>{footer}</View> : null}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.bar, { height: insets.top + 44 }, barStyle]}
      >
        <Text
          style={[styles.barTitle, { marginTop: insets.top + 12 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </Animated.View>
      {picked ? (
        <View style={[styles.pickBar, { paddingTop: insets.top + 6 }]}>
          <Pressable hitSlop={8} onPress={() => setPicked(null)}>
            <Text style={styles.pickText}>Cancel</Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() =>
              setPicked(
                picked.size === tracks.length
                  ? new Set()
                  : new Set(tracks.map((_, i) => i)),
              )
            }
          >
            <Text style={styles.pickText}>
              {picked.size === tracks.length ? "None" : "All"}
            </Text>
          </Pressable>
          <Text style={styles.pickCount} numberOfLines={1}>
            {picked.size ? `${picked.size} selected` : "Tap songs"}
          </Text>
          {editableId ? (
            <PressScale
              disabled={!picked.size}
              onPress={removePicked}
              accessibilityLabel="Remove from playlist"
              style={[
                styles.pickAdd,
                styles.pickRemove,
                !picked.size && { opacity: 0.4 },
              ]}
            >
              <MinusGlyph size={16} weight={2.4} color="#fff" />
            </PressScale>
          ) : null}
          <PressScale
            disabled={!picked.size}
            onPress={() => {
              const chosen = tracks.filter((_, i) => picked.has(i));
              showPlaylistPicker(chosen, { exclude: own });
            }}
            style={[styles.pickAdd, !picked.size && { opacity: 0.4 }]}
          >
            <PlaylistGlyph size={16} weight={2.2} color="#000" />
            <Text style={styles.pickAddText}>Add</Text>
          </PressScale>
        </View>
      ) : (
        <>
          <BackButton />
          {tracks.length || editableId ? (
            <Pressable
              hitSlop={10}
              onPress={menu}
              accessibilityLabel="More"
              style={[styles.more, { top: insets.top + 6 }]}
            >
              <MoreGlyph size={20} color="#fff" />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function PickRow({
  track,
  on,
  accent,
  onPress,
}: {
  track: Track;
  on: boolean;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.editRow}>
      <View
        style={[
          styles.check,
          on && { backgroundColor: accent, borderColor: accent },
        ]}
      >
        {on ? <CheckGlyph size={14} weight={3} color="#000" /> : null}
      </View>
      <Artwork thumbnails={track.thumbnails} size={44} radius={6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.editTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.pickSub} numberOfLines={1}>
          {track.artists.map((a) => a.name).join(", ")}
        </Text>
      </View>
    </Pressable>
  );
}

function EditRow({
  track,
  index,
  count,
  id,
}: {
  track: Track;
  index: number;
  count: number;
  id: string;
}) {
  const lib = useLibrary.getState();
  return (
    <View style={styles.editRow}>
      <Pressable
        hitSlop={8}
        onPress={() => lib.removeFromPlaylist(id, track.id)}
        style={styles.minus}
      >
        <MinusGlyph size={14} weight={3} />
      </Pressable>
      <Artwork thumbnails={track.thumbnails} size={44} radius={6} />
      <Text style={styles.editTitle} numberOfLines={1}>
        {track.title}
      </Text>
      <Pressable
        hitSlop={6}
        disabled={index === 0}
        onPress={() => lib.movePlaylistTrack(id, index, index - 1)}
        style={[styles.arrow, index === 0 && { opacity: 0.25 }]}
      >
        <ArrowUp size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>
      <Pressable
        hitSlop={6}
        disabled={index === count - 1}
        onPress={() => lib.movePlaylistTrack(id, index, index + 1)}
        style={[styles.arrow, index === count - 1 && { opacity: 0.25 }]}
      >
        <ArrowDown size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </View>
  );
}

function IconBtn({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
}) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.icon}
    >
      {children}
    </PressScale>
  );
}

export function confirmDelete(title: string, onYes: () => void) {
  Alert.alert(`Delete ${title}?`, undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onYes },
  ]);
}

export function BackButton() {
  const insets = useSafeAreaInsets();
  if (!router.canGoBack()) return null;
  return (
    <Pressable
      hitSlop={10}
      onPress={() => router.back()}
      style={[styles.back, { top: insets.top + 6 }]}
    >
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </Pressable>
  );
}

export function ShuffleGlyph({ color = "#fff" }: { color?: string }) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M3 7h3.5c3 0 4.5 10 8 10H21M3 17h3.5c1.6 0 2.7-2.6 3.8-5M14.5 7H21M18 4l3 3-3 3M18 14l3 3-3 3" />
    </Svg>
  );
}

export function DownloadGlyph({
  done,
  color = "#fff",
}: {
  done?: boolean;
  color?: string;
}) {
  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {done ? (
        <Path d="M5 12.5l4.5 4.5L19 7.5" />
      ) : (
        <Path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
      )}
    </Svg>
  );
}

function HeartOutline({ filled, color }: { filled: boolean; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M12 20.5s-7.4-4.5-9.6-9C.8 8.1 2.7 4.5 6.3 4.5c2.1 0 3.6 1.2 4.4 2.5h2.6c.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.5 3.6 3.9 7-2.2 4.5-9.6 9-9.6 9z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 14 },
  cover: {
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
    // Elevation casts from the view's own background, which this wrapper lacks.
    ...Platform.select({
      android: { borderRadius: 16, backgroundColor: "#141418" },
    }),
  },
  title: {
    color: "#fff",
    fontSize: 25,
    ...display("800"),
    textAlign: "center",
    marginTop: 18,
    letterSpacing: -0.5,
  },
  titleInput: {
    alignSelf: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.3)",
    paddingBottom: 4,
  },
  subtitle: { fontSize: 19, fontWeight: "600", marginTop: 3 },
  meta: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    alignSelf: "stretch",
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  primary: { backgroundColor: "#fff" },
  btnText: { color: "#fff", fontSize: 16, ...display("700") },
  spot: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13.5,
    marginTop: 12,
    textAlign: "center",
  },
  startOver: { color: "#fff", ...display("700") },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  editText: { color: "#fff", fontSize: 13, ...display("800") },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  minus: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF4F6D",
  },
  editTitle: { flex: 1, color: "#fff", fontSize: 15 },
  menuTitle: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    ...display("800"),
  },
  menuSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    textAlign: "center",
    marginTop: 3,
  },
  more: {
    position: "absolute",
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 },
  pickBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "rgba(10,10,14,0.94)",
  },
  pickText: { color: "#fff", fontSize: 16, ...display("700") },
  pickCount: {
    flex: 1,
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    textAlign: "center",
    fontWeight: "600",
  },
  pickAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  pickRemove: {
    paddingHorizontal: 11,
    backgroundColor: "rgba(255,90,106,0.9)",
  },
  pickAddText: { color: "#000", fontSize: 15, ...display("800") },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(10,10,14,0.92)",
    paddingHorizontal: 60,
  },
  barTitle: { color: "#fff", fontSize: 17, ...display("700") },
  back: {
    position: "absolute",
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
