import {
  artistLine,
  bestThumbnail,
  type Lyrics,
  type Track,
} from "@studio/music-core";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Artwork } from "../../components/artwork";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { activeLine } from "../../lib/lrc";
import { useSetting } from "../../lib/settings";
import type { CatMood } from "../cat/cat";
import { AirPlay } from "./airplay";
import { CatScrubber } from "./cat-scrubber";
import { ColorField } from "./color-field";
import {
  ChevronDown,
  HeartGlyph,
  LyricsGlyph,
  MoreGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PrevGlyph,
  QueueGlyph,
} from "./icons";
import { LyricsView } from "./lyrics-view";
import { useArtworkPalette } from "./use-artwork-palette";

export type NowPlayingStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "error";

export type NowPlayingProps = {
  track?: Track;
  status: NowPlayingStatus;
  position: number;
  duration: number;
  lyrics?: Lyrics | null;
  lyricsLoading?: boolean;
  mode?: "art" | "lyrics";
  liked: boolean;
  context?: { label: string; title?: string };
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (sec: number) => void;
  onLike: () => void;
  onLyrics?: () => void;
  onQueue?: () => void;
  onClose?: () => void;
  onMore?: () => void;
  onShareLyric?: (line: string) => void;
};

const SPRING = { damping: 13, stiffness: 140, mass: 0.9 };

export function NowPlayingView(p: NowPlayingProps) {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState({ w: 0, h: 0 });
  const art = p.track ? bestThumbnail(p.track.thumbnails, 1080) : undefined;
  const palette = useArtworkPalette(
    p.track ? bestThumbnail(p.track.thumbnails, 120) : undefined,
  );
  const background = useSetting<"field" | "blur" | "black">(
    "npBackground",
    "field",
  );
  const showLine = useSetting("lyricsLine", true);
  const playing = p.status === "playing" || p.status === "buffering";
  const mood = useCatMood(p.status, p.liked, p.track);
  const lyricsMode = p.mode === "lyrics";

  const scale = useSharedValue(playing ? 1 : 0.84);
  useEffect(() => {
    scale.set(withSpring(playing ? 1 : 0.84, SPRING));
  }, [playing, scale]);

  // Swipe the artwork sideways to skip; it follows the finger and springs back.
  const swipeX = useSharedValue(0);
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => swipeX.set(e.translationX))
    .onEnd((e) => {
      const go = Math.abs(e.translationX) > 90 || Math.abs(e.velocityX) > 700;
      if (go) {
        haptic.medium();
        const dir = e.translationX < 0 ? -1 : 1;
        swipeX.set(
          withSequence(
            withTiming(dir * 420, { duration: 160 }),
            withTiming(-dir * 420, { duration: 0 }),
            withSpring(0, SPRING),
          ),
        );
        if (dir < 0) p.onNext();
        else p.onPrev();
      } else swipeX.set(withSpring(0, SPRING));
    });
  const artStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: swipeX.value },
      { rotate: `${swipeX.value / 40}deg` },
      { scale: scale.value },
    ],
    opacity: 1 - Math.min(0.5, Math.abs(swipeX.value) / 600),
  }));

  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heart.value }],
  }));
  const like = () => {
    haptic.success();
    heart.set(
      withSequence(
        withTiming(0.7, { duration: 90 }),
        withSpring(1, { damping: 6, stiffness: 320 }),
      ),
    );
    p.onLike();
  };

  const lines = p.lyrics?.synced ? p.lyrics.lines : [];
  const li = activeLine(lines, p.position * 1000);
  const singing = showLine && li >= 0 ? lines[li].text : "";

  const likeButton = (
    <Pressable
      hitSlop={10}
      onPress={like}
      style={[styles.round, p.liked && styles.roundOn]}
    >
      <Animated.View style={heartStyle}>
        <HeartGlyph
          size={20}
          filled={p.liked}
          color={p.liked ? "#FF4F6D" : "#fff"}
        />
      </Animated.View>
    </Pressable>
  );
  const artSize = Math.max(0, Math.min(area.w, area.h - 12, 420));

  return (
    <View style={styles.root}>
      {background === "field" ? (
        <ColorField palette={palette} playing={playing} />
      ) : null}
      {background === "blur" && art ? (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={art}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={60}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.body,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 },
        ]}
      >
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={p.onClose} style={styles.headerBtn}>
            <ChevronDown color="rgba(255,255,255,0.8)" />
          </Pressable>
          <View style={styles.context}>
            <Text style={styles.contextLabel} numberOfLines={1}>
              {p.context?.label ?? "Now playing"}
            </Text>
            {p.context?.title ? (
              <Text style={styles.contextTitle} numberOfLines={1}>
                {p.context.title}
              </Text>
            ) : null}
          </View>
          <Pressable hitSlop={12} onPress={p.onMore} style={styles.headerBtn}>
            <MoreGlyph color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        {lyricsMode ? (
          <Animated.View
            entering={FadeIn.duration(260)}
            style={styles.lyricsArea}
          >
            <View style={styles.compact}>
              {p.track ? (
                <Artwork thumbnails={p.track.thumbnails} size={56} radius={8} />
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.compactTitle} numberOfLines={1}>
                  {p.track?.title ?? ""}
                </Text>
                <Text style={styles.compactArtist} numberOfLines={1}>
                  {p.track ? artistLine(p.track.artists) : ""}
                </Text>
              </View>
              {likeButton}
            </View>
            <View style={{ flex: 1 }}>
              <LyricsView
                lyrics={p.lyrics}
                loading={!!p.lyricsLoading}
                position={p.position}
                onSeek={p.onSeek}
                onShare={p.onShareLyric}
              />
            </View>
          </Animated.View>
        ) : (
          <>
            <GestureDetector gesture={swipe}>
              <View
                style={styles.artArea}
                onLayout={(e) =>
                  setArea({
                    w: e.nativeEvent.layout.width,
                    h: e.nativeEvent.layout.height,
                  })
                }
              >
                <Animated.View
                  style={[
                    styles.artShadow,
                    { width: artSize, height: artSize },
                    artStyle,
                  ]}
                >
                  {art ? (
                    <Image
                      source={art}
                      style={[styles.art, { width: artSize, height: artSize }]}
                      contentFit="cover"
                      transition={350}
                      recyclingKey={p.track?.id}
                    />
                  ) : (
                    <View
                      style={[
                        styles.art,
                        {
                          width: artSize,
                          height: artSize,
                          backgroundColor: "rgba(255,255,255,0.08)",
                        },
                      ]}
                    />
                  )}
                </Animated.View>
              </View>
            </GestureDetector>

            <View style={styles.meta}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Animated.Text
                  key={`t${p.track?.id}`}
                  entering={FadeInDown.duration(320)}
                  style={styles.title}
                  numberOfLines={1}
                >
                  {p.track?.title ?? " "}
                </Animated.Text>
                <Animated.Text
                  key={`a${p.track?.id}`}
                  entering={FadeInDown.duration(380).delay(40)}
                  style={styles.artist}
                  numberOfLines={1}
                >
                  {p.track ? artistLine(p.track.artists) : " "}
                </Animated.Text>
              </View>
              {likeButton}
            </View>

            <Pressable onPress={p.onLyrics} style={styles.singing}>
              {singing ? (
                <Animated.Text
                  key={li}
                  entering={FadeInDown.duration(380)}
                  exiting={FadeOut.duration(200)}
                  style={styles.singingText}
                  numberOfLines={1}
                >
                  {singing}
                </Animated.Text>
              ) : null}
            </Pressable>
          </>
        )}

        <CatScrubber
          position={p.position}
          duration={p.duration}
          mood={mood}
          cups={[palette.accent, palette.accentDeep]}
          playing={playing}
          trackId={p.track?.id}
          onSeek={p.onSeek}
          onLike={() => !p.liked && like()}
        />

        <View style={styles.transport}>
          <Btn
            onPress={() => {
              haptic.light();
              p.onPrev();
            }}
          >
            <PrevGlyph size={42} />
          </Btn>
          <Btn
            onPress={() => {
              haptic.medium();
              p.onToggle();
            }}
            big
          >
            {p.status === "loading" ? (
              <Loader />
            ) : playing ? (
              <PauseGlyph size={52} />
            ) : (
              <PlayGlyph size={52} />
            )}
          </Btn>
          <Btn
            onPress={() => {
              haptic.light();
              p.onNext();
            }}
          >
            <NextGlyph size={42} />
          </Btn>
        </View>

        <View style={styles.bottom}>
          <Pressable
            hitSlop={8}
            onPress={p.onLyrics}
            style={[styles.bottomBtn, lyricsMode && styles.bottomOn]}
          >
            <LyricsGlyph
              color={lyricsMode ? "#fff" : "rgba(255,255,255,0.62)"}
            />
          </Pressable>
          <AirPlay />
          <Pressable hitSlop={8} onPress={p.onQueue} style={styles.bottomBtn}>
            <QueueGlyph color="rgba(255,255,255,0.62)" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Loader() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.set(withTiming(360 * 50, { duration: 40000 }));
  }, [spin]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  return <Animated.View style={[styles.loader, style]} />;
}

function Btn({
  children,
  onPress,
  big,
}: {
  children: React.ReactNode;
  onPress: () => void;
  big?: boolean;
}) {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => s.set(withSpring(0.84, { damping: 15, stiffness: 400 }))}
      onPressOut={() => s.set(withSpring(1, { damping: 9, stiffness: 300 }))}
      style={[styles.btn, big && styles.btnBig]}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}

// Groove while playing, sleep when paused, yawn on resume, a hop on like, excited for a new artist.
function useCatMood(
  status: NowPlayingStatus,
  liked: boolean,
  track?: Track,
): CatMood {
  const [flash, setFlash] = useState<CatMood | null>(null);
  const prev = useRef({ liked, id: track?.id, status });
  const history = useLibrary((s) => s.history);
  useEffect(() => {
    const was = prev.current;
    let next: CatMood | null = null;
    if (liked && !was.liked && was.id === track?.id) next = "happy";
    else if (track?.id !== was.id) {
      const artist = track?.artists[0]?.name;
      const known =
        !!artist &&
        history.slice(1).some((h) => h.track.artists[0]?.name === artist);
      next = artist && !known ? "excited" : "curious";
    } else if (status === "playing" && was.status === "paused") next = "yawn";
    prev.current = { liked, id: track?.id, status };
    if (!next) return;
    setFlash(next);
    const t = setTimeout(
      () => setFlash(null),
      next === "happy" || next === "excited"
        ? 1600
        : next === "yawn"
          ? 1400
          : 900,
    );
    return () => clearTimeout(t);
  }, [liked, track, status, history]);
  if (flash) return flash;
  if (status === "playing") return "groove";
  if (status === "paused" || status === "idle") return "sleep";
  return "curious";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  body: { flex: 1, paddingHorizontal: 28 },
  header: { flexDirection: "row", alignItems: "center", height: 44 },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  context: { flex: 1, alignItems: "center" },
  contextLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  contextTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 1,
  },
  artArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  artShadow: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 22 },
    elevation: 18,
  },
  art: { borderRadius: 16 },
  meta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  artist: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 19,
    fontWeight: "500",
    marginTop: 1,
  },
  round: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  roundOn: { backgroundColor: "rgba(255,255,255,0.92)" },
  singing: {
    height: 26,
    marginTop: 10,
    justifyContent: "center",
    overflow: "hidden",
  },
  singingText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "italic",
  },
  transport: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 14,
  },
  btn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  btnBig: { width: 88, height: 88, borderRadius: 44 },
  loader: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.25)",
    borderTopColor: "#fff",
  },
  bottom: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 18,
  },
  bottomBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomOn: { backgroundColor: "rgba(255,255,255,0.16)" },
  lyricsArea: { flex: 1, marginTop: 6 },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  compactTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  compactArtist: { color: "rgba(255,255,255,0.6)", fontSize: 15, marginTop: 1 },
});
