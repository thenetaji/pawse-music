import { artistLine, type Track } from "@pawse/music-core";
import { player, usePlayerSelect } from "@pawse/player";
import { memo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Svg, { Path } from "react-native-svg";

import { useDownload } from "../data/downloads";
import { showTrackActions } from "../features/library/track-actions";
import { MoreGlyph } from "../features/now-playing/icons";
import { useAccent } from "../features/now-playing/now-palette";
import { haptic } from "../lib/haptics";
import { Artwork } from "./artwork";
import { EqBars } from "./eq-bars";

type Props = {
  track: Track;
  onPress: () => void;
  index?: number;
  showArt?: boolean;
  subtitle?: string;
  /** Off inside horizontal carousels, where a sideways swipe should scroll. */
  swipeable?: boolean;
};

// Swipe right to play next, left to add to the queue; long-press for everything else.
export const TrackRow = memo(function TrackRow({
  track,
  onPress,
  index,
  showArt = true,
  subtitle,
  swipeable = true,
}: Props) {
  const current = usePlayerSelect((s) => s.current?.id === track.id);
  const playing = usePlayerSelect((s) => s.status === "playing");
  const dl = useDownload(track.id);
  const accent = useAccent();
  const swipe = useRef<SwipeableMethods>(null);
  const sub =
    subtitle ??
    [artistLine(track.artists), track.album?.title].filter(Boolean).join(" · ");
  const content = (
    <Pressable
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      onLongPress={() => showTrackActions(track)}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {showArt ? (
        <View>
          <Artwork thumbnails={track.thumbnails} size={50} radius={7} />
          {current ? (
            <View style={styles.overlay}>
              <EqBars color="#fff" playing={playing} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.num}>
          {current ? (
            <EqBars color={accent} playing={playing} />
          ) : (
            <Text style={styles.numText}>{index}</Text>
          )}
        </View>
      )}
      <View style={styles.text}>
        <Text
          style={[styles.title, current && { color: accent }]}
          numberOfLines={1}
        >
          {track.explicit ? <Text style={styles.e}>E </Text> : null}
          {track.title}
        </Text>
        <View style={styles.subRow}>
          {dl.state === "done" ? (
            <DownloadedDot color={accent} />
          ) : dl.state === "downloading" ? (
            <Text style={[styles.pct, { color: accent }]}>
              {Math.round(dl.progress * 100)}%
            </Text>
          ) : null}
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </View>
      <Pressable
        hitSlop={12}
        onPress={() => showTrackActions(track)}
        style={styles.more}
      >
        <MoreGlyph size={18} color="rgba(255,255,255,0.5)" />
      </Pressable>
    </Pressable>
  );
  if (!swipeable) return content;
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.8}
      leftThreshold={70}
      rightThreshold={70}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <View style={[styles.action, { backgroundColor: accent }]}>
          <Text style={styles.actionText}>Play next</Text>
        </View>
      )}
      renderRightActions={() => (
        <View style={[styles.action, styles.right]}>
          <Text style={[styles.actionText, { color: "#fff" }]}>
            Add to queue
          </Text>
        </View>
      )}
      onSwipeableWillOpen={(dir) => {
        haptic.medium();
        if (dir === "right") player.addNext(track);
        else player.addToQueue(track);
        setTimeout(() => swipe.current?.close(), 180);
      }}
    >
      {content}
    </ReanimatedSwipeable>
  );
});

function DownloadedDot({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill={color} />
      <Path
        d="M12 7v7M8.5 11l3.5 3.5 3.5-3.5"
        stroke="#000"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
    backgroundColor: "#000",
  },
  pressed: { backgroundColor: "#111114" },
  overlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 7,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  num: { width: 26, alignItems: "center" },
  numText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 16, fontWeight: "500" },
  e: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "800" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  sub: { flexShrink: 1, color: "rgba(255,255,255,0.5)", fontSize: 13.5 },
  pct: { fontSize: 11, fontWeight: "800" },
  more: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  action: { flex: 1, justifyContent: "center", paddingHorizontal: 22 },
  right: { backgroundColor: "#2B2B34", alignItems: "flex-end" },
  actionText: { color: "#000", fontSize: 15, fontWeight: "800" },
});
