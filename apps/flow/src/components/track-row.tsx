import { artistLine, type Track } from "@studio/music-core";
import { usePlayerSelect } from "@studio/player";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { showTrackActions } from "../features/library/track-actions";
import { MoreGlyph } from "../features/now-playing/icons";
import { useAccent } from "../features/now-playing/now-palette";
import { Artwork } from "./artwork";
import { EqBars } from "./eq-bars";

type Props = {
  track: Track;
  onPress: () => void;
  index?: number;
  showArt?: boolean;
  subtitle?: string;
};

export const TrackRow = memo(function TrackRow({
  track,
  onPress,
  index,
  showArt = true,
  subtitle,
}: Props) {
  const current = usePlayerSelect((s) => s.current?.id === track.id);
  const playing = usePlayerSelect((s) => s.status === "playing");
  const accent = useAccent();
  const sub =
    subtitle ??
    [artistLine(track.artists), track.album?.title].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => showTrackActions(track)}
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
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
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
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.06)" },
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
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 13.5, marginTop: 2 },
  more: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
