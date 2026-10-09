import { type ArtistDetail, bestThumbnail } from "@pawse/music-core";
import { player } from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomSpace } from "../../components/page";
import { Shelf } from "../../components/shelf";
import { CatState, PressScale, SkeletonShelves } from "../../components/ui";
import { useLibrary } from "../../data/library";
import { yt } from "../../lib/engine";
import { haptic } from "../../lib/haptics";
import { useResource } from "../../lib/use-resource";
import { PlayGlyph } from "../now-playing/icons";
import { Shell } from "./album-page";
import { BackButton, ShuffleGlyph } from "./collection";

export default function ArtistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const artist = useResource<ArtistDetail>(`artist:${id}`, () => yt.artist(id));
  const following = useLibrary((s) =>
    s.followedArtists.some((a) => a.id === id),
  );
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const heroH = Math.round(Math.max(width, 360) * 1.05);
  // Stretch on pull, parallax on scroll.
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          y.value,
          [-heroH, 0, heroH],
          [-heroH / 2, 0, heroH * 0.5],
        ),
      },
      { scale: interpolate(y.value, [-heroH, 0], [2, 1], "clamp") },
    ],
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [heroH - 160, heroH - 90], [0, 1], "clamp"),
  }));

  const a = artist.data;
  if (!a)
    return (
      <Shell>
        {artist.error ? (
          <CatState
            kind="error"
            message="Couldn't open this artist."
            action="Try again"
            onAction={artist.reload}
          />
        ) : (
          <SkeletonShelves />
        )}
      </Shell>
    );
  const hero = bestThumbnail(a.thumbnails, 1080);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: bottom }}
      >
        <View style={{ height: heroH, overflow: "visible" }}>
          <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
            {hero ? (
              <Image
                source={hero}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
            ) : null}
          </Animated.View>
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.3)", "#000"]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            entering={FadeInDown.duration(420)}
            style={styles.heroText}
          >
            <Text style={styles.name} numberOfLines={2}>
              {a.name}
            </Text>
            {a.subscribers ? (
              <Text style={styles.subs}>
                {/subscriber|listener|view/i.test(a.subscribers)
                  ? a.subscribers
                  : `${a.subscribers} subscribers`}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {a.radioPlaylistId ? (
                <PressScale
                  onPress={() =>
                    void player.playRadio({
                      playlistId: a.radioPlaylistId,
                      title: `${a.name} radio`,
                    })
                  }
                  style={[styles.btn, styles.primary]}
                >
                  <PlayGlyph size={18} color="#000" />
                  <Text style={[styles.btnText, { color: "#000" }]}>Radio</Text>
                </PressScale>
              ) : null}
              {a.shufflePlaylistId ? (
                <PressScale
                  onPress={() =>
                    void player.playRadio({
                      playlistId: a.shufflePlaylistId,
                      title: a.name,
                    })
                  }
                  style={styles.btn}
                >
                  <ShuffleGlyph />
                  <Text style={styles.btnText}>Shuffle</Text>
                </PressScale>
              ) : null}
              <PressScale
                onPress={() => {
                  haptic.success();
                  useLibrary.getState().toggleFollowArtist({
                    id: a.id,
                    name: a.name,
                    subtitle: a.subscribers,
                    thumbnails: a.thumbnails,
                  });
                }}
                style={[styles.follow, following && styles.following]}
              >
                <Text
                  style={[styles.followText, following && { color: "#000" }]}
                >
                  {following ? "Following" : "Follow"}
                </Text>
              </PressScale>
            </View>
          </Animated.View>
        </View>
        {a.shelves.map((s, i) => (
          <Shelf key={`${s.title}${i}`} shelf={s} />
        ))}
        {a.description ? (
          <View style={styles.aboutBox}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.about} numberOfLines={8}>
              {a.description}
            </Text>
          </View>
        ) : null}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[styles.bar, { height: insets.top + 44 }, barStyle]}
      >
        <Text
          style={[styles.barTitle, { marginTop: insets.top + 12 }]}
          numberOfLines={1}
        >
          {a.name}
        </Text>
      </Animated.View>
      <BackButton />
    </View>
  );
}

const styles = StyleSheet.create({
  heroText: { position: "absolute", left: 20, right: 20, bottom: 6 },
  name: {
    color: "#fff",
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: -1.6,
    lineHeight: 50,
  },
  subs: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
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
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  follow: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  following: { backgroundColor: "#fff", borderColor: "#fff" },
  followText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  aboutBox: {
    marginHorizontal: 16,
    marginTop: 30,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  aboutTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  about: { color: "rgba(255,255,255,0.65)", fontSize: 15, lineHeight: 21 },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(10,10,14,0.92)",
    paddingHorizontal: 60,
  },
  barTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
