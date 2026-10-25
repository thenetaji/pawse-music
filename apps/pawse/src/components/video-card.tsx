import {
  bestThumbnail,
  type ChannelItem,
  type VideoItem,
} from "@pawse/music-core";
import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MoreGlyph } from "../features/now-playing/icons";

import { blockChannel } from "../lib/block";
import { useBranding } from "../lib/community";
import { rightClick } from "../lib/context-menu";
import { go, push } from "../lib/nav";
import { openWatch } from "../features/watch/store";
import { display } from "../lib/type";
import { showSheet } from "./action-sheet";
import { PressScale } from "./ui";

export const clock = (sec?: number) => {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

export const videoMeta = (v: VideoItem, channel = true) =>
  [channel ? v.channel?.name : undefined, v.viewsText, v.publishedText]
    .filter(Boolean)
    .join(" · ");

export const openVideo = (v: VideoItem) =>
  openWatch({
    id: v.id,
    title: v.title,
    thumbnails: v.thumbnails,
    channel: v.channel,
  });
export const openChannel = (id: string) => go(`/channel/${id}`);

/** Long press: block the channel, so none of its videos show again. */
export function showVideoActions(v: VideoItem) {
  const ch = v.channel;
  const id = ch?.id;
  showSheet({
    actions: [
      { label: "Open", onPress: () => openVideo(v) },
      ...(ch && id
        ? [
            {
              label: `Block ${ch.name}`,
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
  return (
    <PressScale
      onPress={() => openVideo(video)}
      onLongPress={() => showVideoActions(video)}
      {...rightClick(() => showVideoActions(video))}
      style={tile ? styles.tile : styles.card}
    >
      <Thumb v={video} src={brand?.thumbnail} bleed={!tile} />
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
          <Text style={styles.meta} numberOfLines={1}>
            {videoMeta(video, !hideChannel)}
          </Text>
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
  return (
    <PressScale
      onPress={onPress ?? (() => openVideo(video))}
      onLongPress={() => showVideoActions(video)}
      {...rightClick(() => showVideoActions(video))}
      style={styles.row}
    >
      <Thumb v={video} width={150} src={brand?.thumbnail} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {brand?.title ?? video.title}
        </Text>
        <Text style={styles.meta} numberOfLines={2}>
          {videoMeta(video)}
        </Text>
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
