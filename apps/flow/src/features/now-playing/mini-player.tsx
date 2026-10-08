import { artistLine } from "@studio/music-core";
import { player, usePlayerState } from "@studio/player";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Artwork } from "../../components/artwork";
import { NextGlyph, PauseGlyph, PlayGlyph } from "./icons";

// Lives in the iOS 26 tab bar accessory (or floats above the tab bar elsewhere). Tap to open the player.
export function MiniPlayer({ inline }: { inline?: boolean }) {
  const { current, status } = usePlayerState();
  if (!current) return null;
  const playing = status === "playing" || status === "buffering";
  return (
    <Pressable
      onPress={() => router.push("/now-playing")}
      style={[styles.row, inline && styles.inline]}
    >
      <Artwork
        thumbnails={current.thumbnails}
        size={inline ? 26 : 34}
        radius={inline ? 6 : 7}
      />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {current.title}
        </Text>
        {!inline && (
          <Text style={styles.sub} numberOfLines={1}>
            {artistLine(current.artists)}
          </Text>
        )}
      </View>
      <Pressable
        hitSlop={10}
        onPress={() => player.toggle()}
        style={styles.btn}
      >
        {playing ? (
          <PauseGlyph size={inline ? 22 : 26} />
        ) : (
          <PlayGlyph size={inline ? 22 : 26} />
        )}
      </Pressable>
      {!inline && (
        <Pressable
          hitSlop={10}
          onPress={() => player.next()}
          style={styles.btn}
        >
          <NextGlyph size={24} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 10,
    paddingRight: 6,
  },
  inline: { gap: 8, paddingLeft: 6 },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 12.5, marginTop: 1 },
  btn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
});
