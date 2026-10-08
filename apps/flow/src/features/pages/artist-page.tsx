import { type ArtistDetail, bestThumbnail } from "@studio/music-core";
import { player } from "@studio/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ErrorState, Loading, useBottomSpace } from "../../components/page";
import { Shelf } from "../../components/shelf";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { PlayGlyph } from "../now-playing/icons";
import { Shell } from "./album-page";
import { BackButton, ShuffleGlyph } from "./collection";

export default function ArtistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const bottom = useBottomSpace();
  const artist = useResource<ArtistDetail>(`artist:${id}`, () => yt.artist(id));
  const a = artist.data;
  if (!a)
    return (
      <Shell>
        {artist.error ? (
          <ErrorState
            message="Couldn't open this artist"
            onRetry={artist.reload}
          />
        ) : (
          <Loading />
        )}
      </Shell>
    );
  const hero = bestThumbnail(a.thumbnails, 1080);
  const heroH = Math.round(Math.max(width, 360) * 1.05);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <View style={{ height: heroH }}>
          {hero ? (
            <Image
              source={hero}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />
          ) : null}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.25)", "#000"]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={2}>
              {a.name}
            </Text>
            {a.subscribers ? (
              <Text style={styles.subs}>{a.subscribers}</Text>
            ) : null}
            <View style={styles.actions}>
              {a.radioPlaylistId ? (
                <Pressable
                  onPress={() =>
                    void player.playRadio({
                      playlistId: a.radioPlaylistId,
                      title: `${a.name} radio`,
                    })
                  }
                  style={({ pressed }) => [
                    styles.btn,
                    styles.primary,
                    pressed && styles.pressed,
                  ]}
                >
                  <PlayGlyph size={18} color="#000" />
                  <Text style={[styles.btnText, { color: "#000" }]}>Radio</Text>
                </Pressable>
              ) : null}
              {a.shufflePlaylistId ? (
                <Pressable
                  onPress={() =>
                    void player.playRadio({
                      playlistId: a.shufflePlaylistId,
                      title: a.name,
                    })
                  }
                  style={({ pressed }) => [
                    styles.btn,
                    pressed && styles.pressed,
                  ]}
                >
                  <ShuffleGlyph />
                  <Text style={styles.btnText}>Shuffle</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        {a.shelves.map((s, i) => (
          <Shelf key={`${s.title}${i}`} shelf={s} />
        ))}
        {a.description ? (
          <Text style={styles.about} numberOfLines={6}>
            {a.description}
          </Text>
        ) : null}
      </ScrollView>
      <BackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  heroText: { position: "absolute", left: 20, right: 20, bottom: 6 },
  name: {
    color: "#fff",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1.4,
    lineHeight: 48,
  },
  subs: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  primary: { backgroundColor: "#fff" },
  pressed: { opacity: 0.75 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  about: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 20,
    marginTop: 28,
  },
});
