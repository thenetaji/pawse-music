import { bestThumbnail, type Thumbnail, type Track } from "@pawse/music-core";
import { player, type QueueSource } from "@pawse/player";
import { router } from "expo-router";
import { type ReactNode, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
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
import { Artwork } from "../../components/artwork";
import { ArrowDown, ArrowUp, MinusGlyph } from "../../components/glyphs";
import { useBottomSpace } from "../../components/page";
import { TrackRow } from "../../components/track-row";
import { PressScale } from "../../components/ui";
import { downloadMany, useDownloads } from "../../data/downloads";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { getSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { PlayGlyph } from "../now-playing/icons";
import { readable } from "../now-playing/now-palette";
import { useArtworkPalette } from "../now-playing/use-artwork-palette";
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
  saved,
  onSave,
  editableId,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const palette = useArtworkPalette(bestThumbnail(thumbnails, 120));
  const [editing, setEditing] = useState(false);
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
      endless:
        getSetting("radioContinue", true) && getSetting("listsContinue", false),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Animated.FlatList
        data={tracks}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(t, i) => `${t.id}${i}`}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
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
                    onPress={() => play(0)}
                    style={[styles.btn, styles.primary]}
                  >
                    <PlayGlyph size={18} color="#000" />
                    <Text style={[styles.btnText, { color: "#000" }]}>
                      Play
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
            </View>
          </View>
        }
        renderItem={({ item, index }) =>
          editing && editableId ? (
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
              onPress={() => play(index)}
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
      <BackButton />
    </View>
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
