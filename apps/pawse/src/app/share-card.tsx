import { artistLine, bestThumbnail } from "@pawse/music-core";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useRef } from "react";
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { PressScale } from "../components/ui";
import { Cat, type CatColor } from "../features/cat/cat";
import { useArtworkPalette } from "../features/now-playing/use-artwork-palette";
import { haptic } from "../lib/haptics";
import { useSetting } from "../lib/settings";
import { useShareCard } from "../lib/share-card-store";

// A shareable card: artwork-coloured, the cat in the corner, optional lyric.
export default function ShareCard() {
  const insets = useSafeAreaInsets();
  const { track, lyric } = useShareCard();
  const color = useSetting<CatColor>("catColor", "orange");
  const palette = useArtworkPalette(
    track ? bestThumbnail(track.thumbnails, 120) : undefined,
  );
  const card = useRef<View>(null);
  if (!track) return null;
  const share = async () => {
    haptic.light();
    try {
      const uri = await captureRef(card, { format: "png", quality: 1 });
      // Android's Share ignores `url`, so the image goes through expo-sharing there.
      if (Platform.OS === "android") {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
        return;
      }
      await Share.share({
        url: uri,
        message: `${track.title} · ${artistLine(track.artists)}\nhttps://music.youtube.com/watch?v=${track.id}`,
      });
    } catch {}
  };
  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <View style={styles.head}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.duration(240)}>
          <View
            ref={card}
            collapsable={false}
            style={[styles.card, { backgroundColor: palette.colors[0] }]}
          >
            <View
              style={[styles.blob, { backgroundColor: palette.colors[1] }]}
            />
            <View
              style={[styles.blob2, { backgroundColor: palette.colors[2] }]}
            />
            <Image
              source={bestThumbnail(track.thumbnails, 800)}
              style={styles.art}
              contentFit="cover"
            />
            {lyric ? <Text style={styles.lyric}>“{lyric}”</Text> : null}
            <Text style={styles.title} numberOfLines={2}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {artistLine(track.artists)}
            </Text>
            <View style={styles.foot}>
              <Text style={styles.brand}>Pawse</Text>
              <Cat mood="happy" size={46} color={color} />
            </View>
          </View>
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(150)}>
        <PressScale onPress={share} style={styles.cta}>
          <Text style={styles.ctaText}>Share</Text>
        </PressScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", paddingHorizontal: 20 },
  head: { flexDirection: "row", justifyContent: "flex-end" },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { width: 320, borderRadius: 30, padding: 22, overflow: "hidden" },
  blob: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    right: -90,
    top: -70,
    opacity: 0.9,
  },
  blob2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    left: -80,
    bottom: -60,
    opacity: 0.8,
  },
  art: { width: 276, height: 276, borderRadius: 18 },
  lyric: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 27,
    marginTop: 18,
    letterSpacing: -0.3,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 16,
    letterSpacing: -0.4,
  },
  artist: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 2,
  },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  brand: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cta: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ctaText: { color: "#000", fontSize: 17, fontWeight: "800" },
});
