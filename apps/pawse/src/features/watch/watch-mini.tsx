import { bestThumbnail } from "@pawse/music-core";
import { Image } from "expo-image";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { CloseGlyph } from "../../components/glyphs";
import { haptic } from "../../lib/haptics";
import { PauseGlyph, PlayGlyph } from "../now-playing/icons";
import { VideoSurface } from "../video/watch-player";
import { closeWatch, expandWatch, useWatch } from "./store";

/** The video, small, in the mini player slot: tap to grow it back, play or pause, or close it. */
export function WatchMini({
  inline,
  still,
}: {
  inline?: boolean;
  /** A picture instead of the live video: iOS draws the tab-bar slot twice, and two views on one player fight. */
  still?: boolean;
}) {
  const thumbs = useWatch((s) => s.seed?.thumbnails);
  const player = useWatch((s) => s.player);
  const playing = useWatch((s) => s.playing);
  const title = useWatch((s) => s.title);
  const channel = useWatch((s) => s.channel);
  const progress = useWatch((s) => s.progress);
  const h = inline ? 30 : 40;
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        expandWatch();
      }}
      style={styles.wrap}
      accessibilityLabel="Open the video"
    >
      <Animated.View
        entering={FadeIn.duration(220)}
        style={[styles.row, inline && styles.inline]}
      >
        <View style={[styles.pic, { width: (h * 16) / 9, height: h }]}>
          {still || !player ? (
            <Image
              source={bestThumbnail(thumbs ?? [], 240)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <VideoSurface
              surface={player.surface}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title ?? "Video"}
          </Text>
          {channel && !inline ? (
            <Text style={styles.sub} numberOfLines={1}>
              {channel}
            </Text>
          ) : null}
        </View>
        <Pressable
          hitSlop={8}
          onPress={() => {
            haptic.light();
            player?.toggle();
          }}
          style={styles.btn}
          accessibilityLabel={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <PauseGlyph size={22} color="#fff" />
          ) : (
            <PlayGlyph size={22} color="#fff" />
          )}
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => {
            haptic.light();
            player?.pause();
            closeWatch();
          }}
          style={styles.btn}
          accessibilityLabel="Close the video"
        >
          <CloseGlyph size={16} weight={2.6} color="rgba(255,255,255,0.85)" />
        </Pressable>
      </Animated.View>
      <View style={styles.bar} pointerEvents="none">
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

/** Computers have no tab bar slot, so the mini video floats above the player bar. */
export function FloatingWatchMini() {
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web") return null;
  return (
    <View style={[styles.floating, { width: Math.min(420, width - 32) }]}>
      <WatchMini />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center" },
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  barFill: { height: 2, backgroundColor: "rgba(255,255,255,0.85)" },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 8,
    paddingRight: 4,
  },
  inline: { gap: 8, paddingLeft: 6 },
  pic: { borderRadius: 6, overflow: "hidden", backgroundColor: "#000" },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 14.5, fontWeight: "600" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 12.5, marginTop: 1 },
  btn: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  floating: {
    position: "absolute",
    right: 16,
    bottom: 100,
    height: 64,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(28,27,34,0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
});
