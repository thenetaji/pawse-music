import { bestThumbnail, type Thumbnail, type Track } from "@studio/music-core";
import { player, type QueueSource } from "@studio/player";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Artwork } from "../../components/artwork";
import { useBottomSpace } from "../../components/page";
import { TrackRow } from "../../components/track-row";
import { PlayGlyph } from "../now-playing/icons";
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
};

// Album and playlist pages: the cover's own colours wash the top, then the track list.
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
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const palette = useArtworkPalette(bestThumbnail(thumbnails, 120));
  const play = (i: number, shuffle = false) => {
    player.setShuffle(shuffle);
    void player.play(tracks, i, { source, radio: true });
  };
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <FlatList
        data={tracks}
        keyExtractor={(t, i) => `${t.id}${i}`}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: bottom }}
        ListHeaderComponent={
          <View>
            <TopGlow
              height={520}
              colors={[palette.colors[0], palette.colors[2]]}
            />
            <View style={[styles.hero, { paddingTop: insets.top + 50 }]}>
              <View style={styles.cover}>
                <Artwork thumbnails={thumbnails} size={230} radius={14} />
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.subtitle, { color: palette.accent }]}
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              ) : null}
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
              <View style={styles.actions}>
                <Pressable
                  disabled={!tracks.length}
                  onPress={() => play(0)}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.primary,
                    pressed && styles.pressed,
                  ]}
                >
                  <PlayGlyph size={18} color="#000" />
                  <Text style={[styles.btnText, { color: "#000" }]}>Play</Text>
                </Pressable>
                <Pressable
                  disabled={!tracks.length}
                  onPress={() =>
                    play(Math.floor(Math.random() * tracks.length), true)
                  }
                  style={({ pressed }) => [
                    styles.btn,
                    pressed && styles.pressed,
                  ]}
                >
                  <ShuffleGlyph />
                  <Text style={styles.btnText}>Shuffle</Text>
                </Pressable>
              </View>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index + 1}
            showArt={!numbered}
            onPress={() => play(index)}
            subtitle={
              numbered ? item.artists.map((a) => a.name).join(", ") : undefined
            }
          />
        )}
        ListFooterComponent={footer ? <View>{footer}</View> : null}
      />
      <BackButton />
    </View>
  );
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

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 14 },
  cover: {
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 18,
    letterSpacing: -0.4,
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
    gap: 12,
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
  pressed: { opacity: 0.75 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
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
