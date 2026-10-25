import {
  bestThumbnail,
  type ChannelItem,
  type VideoItem,
} from "@pawse/music-core";
import { player } from "@pawse/player";
import { Image } from "expo-image";
import { memo } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";

import { downloadVideo } from "../data/downloads";
import { isPinned, togglePin } from "../data/pins";
import { removeWatched, useWatched, videoTrack } from "../data/watched";
import { showPlaylistPicker } from "../features/library/playlist-tools";
import { MoreGlyph } from "../features/now-playing/icons";
import { minimizeWatch, openWatch, useWatch } from "../features/watch/store";
import { blockChannel } from "../lib/block";
import { useBranding } from "../lib/community";
import { rightClick } from "../lib/context-menu";
import { plainThumb, useFocus } from "../lib/focus";
import { go } from "../lib/nav";
import { display } from "../lib/type";
import { showSheet } from "./action-sheet";
import {
  ChannelGlyph,
  DeArrowMark,
  DownloadGlyph,
  HeadphonesGlyph,
  HideGlyph,
  MusicGlyph,
  PinGlyph,
  PlaylistGlyph,
  ShareGlyph,
  TrashGlyph,
} from "./glyphs";
import { showToast } from "./toast";
import { PressScale } from "./ui";

export const clock = (sec?: number) => {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

export const videoMeta = (v: VideoItem, channel = true, counts = true) =>
  [
    channel ? v.channel?.name : undefined,
    counts ? v.viewsText : undefined,
    v.publishedText,
  ]
    .filter(Boolean)
    .join(" · ");

export const openVideo = (v: VideoItem) =>
  openWatch({
    id: v.id,
    title: v.title,
    thumbnails: v.thumbnails,
    channel: v.channel,
  });
/** A channel page opens under the video, so a full-screen video shrinks out of the way first. */
export const openChannel = (id: string) => {
  const w = useWatch.getState();
  if (w.id && w.mode === "full") minimizeWatch();
  go(`/channel/${id}`);
};

/** The ⋯ menu on any video: the picture and title on top, then everything you can do with it. */
export function showVideoActions(v: VideoItem) {
  const ch = v.channel;
  const id = ch?.id;
  const track = videoTrack(v);
  const link = `https://youtu.be/${v.id}`;
  showSheet({
    header: (
      <View style={styles.sheetHead}>
        <Image
          source={bestThumbnail(v.thumbnails, 240)}
          style={styles.sheetThumb}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {v.title}
          </Text>
          {ch ? (
            <Text style={styles.sheetSub} numberOfLines={1}>
              {ch.name}
            </Text>
          ) : null}
        </View>
      </View>
    ),
    quick: [
      {
        label: "Save",
        icon: (c) => <PlaylistGlyph size={22} color={c} />,
        onPress: () => showPlaylistPicker([track]),
      },
      ...(Platform.OS !== "web"
        ? [
            {
              label: "Download",
              icon: (c: string) => <DownloadGlyph size={22} color={c} />,
              onPress: () => {
                downloadVideo(track, 720);
                showToast("Downloading in 720p");
              },
            },
          ]
        : []),
      {
        label: "Share",
        icon: (c) => <ShareGlyph size={22} color={c} />,
        onPress: () =>
          void Share.share(
            Platform.OS === "ios" ? { url: link } : { message: link },
          ),
      },
    ],
    actions: [
      {
        label: "Listen",
        sub: "Plays as audio in the music player",
        icon: (c) => <HeadphonesGlyph size={22} color={c} />,
        onPress: () =>
          void player.play([track], 0, {
            source: { type: "other", title: "From YouTube" },
          }),
      },
      {
        label: isPinned(v.id) ? "Unpin from Home" : "Pin to Home",
        icon: (c) => <PinGlyph size={22} color={c} />,
        onPress: () =>
          togglePin({
            kind: "video",
            id: v.id,
            title: v.title,
            sub: ch?.name,
            thumbnails: v.thumbnails,
          }),
      },
      ...(useWatched.getState().list.some((w) => w.id === v.id)
        ? [
            {
              label: "Remove from history",
              icon: (c: string) => <TrashGlyph size={22} color={c} />,
              onPress: () => removeWatched(v.id),
            },
          ]
        : []),
      ...(ch && id
        ? [
            {
              label: "Go to channel",
              icon: (c: string) => <ChannelGlyph size={22} color={c} />,
              onPress: () => openChannel(id),
            },
            {
              label: `Don't show ${ch.name}`,
              icon: (c: string) => <HideGlyph size={22} color={c} />,
              destructive: true,
              onPress: () => blockChannel({ id, name: ch.name }),
            },
          ]
        : []),
    ],
  });
}

function Thumb({
  v,
  width,
  src,
  bleed,
}: {
  v: VideoItem;
  width?: number;
  src?: string;
  /** Edge to edge, square corners. */
  bleed?: boolean;
}) {
  return (
    <View
      style={[styles.thumb, width ? { width } : null, bleed && styles.bleed]}
    >
      <Image
        source={src ?? bestThumbnail(v.thumbnails, 720)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
      />
      {v.live ? (
        <Text style={[styles.badge, styles.live]}>LIVE</Text>
      ) : v.durationSec ? (
        <Text style={styles.badge}>{clock(v.durationSec)}</Text>
      ) : null}
    </View>
  );
}

/** A wide 16:9 card: the thumbnail first, then the channel's face and two lines of title.
 * On phones the picture runs edge to edge, like YouTube; in a grid it's a rounded tile. */
export const VideoCard = memo(function VideoCard({
  video,
  hideChannel,
  tile,
}: {
  video: VideoItem;
  hideChannel?: boolean;
  /** In a multi-column grid: rounded picture, no side padding. */
  tile?: boolean;
}) {
  const avatar =
    video.channel?.avatar && bestThumbnail(video.channel.avatar, 88);
  const brand = useBranding(video.id);
  const focus = useFocus();
  const pic = focus.plainThumbs ? plainThumb(video.id) : brand?.thumbnail;
  return (
    <PressScale
      onPress={() => openVideo(video)}
      onLongPress={() => showVideoActions(video)}
      {...rightClick(() => showVideoActions(video))}
      style={tile ? styles.tile : styles.card}
    >
      <Thumb v={video} src={pic} bleed={!tile} />
      <View style={[styles.info, !tile && styles.infoPad]}>
        {avatar && !hideChannel ? (
          <PressScale
            onPress={() => video.channel?.id && openChannel(video.channel.id)}
            hitSlop={6}
          >
            <Image source={avatar} style={styles.avatar} />
          </PressScale>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {brand?.title ?? video.title}
          </Text>
          <View style={styles.metaRow}>
            {video.music ? (
              <MusicGlyph
                size={12}
                color="rgba(255,255,255,0.6)"
                weight={2.4}
              />
            ) : null}
            {brand?.title || brand?.thumbnail ? <DeArrowMark /> : null}
            <Text style={styles.metaText} numberOfLines={1}>
              {videoMeta(video, !hideChannel, focus.counts)}
            </Text>
          </View>
        </View>
        <PressScale
          hitSlop={10}
          onPress={() => showVideoActions(video)}
          style={styles.more}
          accessibilityLabel="More"
        >
          <MoreGlyph size={18} color="rgba(255,255,255,0.8)" />
        </PressScale>
      </View>
    </PressScale>
  );
});

/** A compact row for "Up next": small thumbnail beside the title. */
export const VideoRow = memo(function VideoRow({
  video,
  onPress,
}: {
  video: VideoItem;
  onPress?: () => void;
}) {
  const brand = useBranding(video.id);
  const focus = useFocus();
  const pic = focus.plainThumbs ? plainThumb(video.id) : brand?.thumbnail;
  return (
    <PressScale
      onPress={onPress ?? (() => openVideo(video))}
      onLongPress={() => showVideoActions(video)}
      {...rightClick(() => showVideoActions(video))}
      style={styles.row}
    >
      <Thumb v={video} width={150} src={pic} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {brand?.title ?? video.title}
        </Text>
        <View style={styles.metaRow}>
          {video.music ? (
            <MusicGlyph size={12} color="rgba(255,255,255,0.6)" weight={2.4} />
          ) : null}
          {brand?.title || brand?.thumbnail ? <DeArrowMark /> : null}
          <Text style={styles.metaText} numberOfLines={2}>
            {videoMeta(video, true, focus.counts)}
          </Text>
        </View>
      </View>
    </PressScale>
  );
});

export function ChannelRow({ channel }: { channel: ChannelItem }) {
  return (
    <PressScale onPress={() => openChannel(channel.id)} style={styles.chRow}>
      <Image
        source={bestThumbnail(channel.avatar, 120)}
        style={styles.chAvatar}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {channel.name}
        </Text>
        {channel.subscribersText ? (
          <Text style={styles.meta}>{channel.subscribersText}</Text>
        ) : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetThumb: {
    width: 96,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#16151b",
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 19,
    ...display("700"),
  },
  sheetSub: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 2 },
  card: { marginBottom: 20 },
  tile: { flex: 1, marginBottom: 22 },
  bleed: { borderRadius: 0 },
  thumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#16151b",
  },
  badge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    color: "#fff",
    fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.72)",
    ...display("700"),
  },
  live: { backgroundColor: "#e5332a" },
  info: { flexDirection: "row", gap: 12, marginTop: 11 },
  infoPad: { paddingLeft: 14, paddingRight: 6 },
  more: { paddingHorizontal: 6, paddingTop: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#222",
  },
  title: { color: "#fff", fontSize: 15.5, lineHeight: 20, ...display("700") },
  rowTitle: {
    color: "#fff",
    fontSize: 14.5,
    lineHeight: 19,
    ...display("700"),
  },
  meta: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  metaText: { flexShrink: 1, color: "rgba(255,255,255,0.55)", fontSize: 13 },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  chRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  chAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#222",
  },
});
