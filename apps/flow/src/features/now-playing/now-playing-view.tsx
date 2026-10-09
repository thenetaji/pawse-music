import {
  artistLine,
  bestThumbnail,
  type Lyrics,
  type Track,
} from "@studio/music-core";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
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
import { useDataSaverActive } from "../../data/downloads";
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
  const win = useWindowDimensions();
  const saver = useDataSaverActive();
  const art = p.track
    ? bestThumbnail(p.track.thumbnails, saver ? 544 : 1080)
    : undefined;
  const hero = useHeroArt(p.track?.id, art, saver);
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

  // Paused: the artwork dims and settles back a touch.
  const live = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    live.set(withTiming(playing ? 1 : 0, { duration: 420 }));
  }, [playing, live]);

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
    transform: [{ translateX: swipeX.value }, { scale: 1 + live.value * 0.03 }],
    opacity:
      (0.62 + live.value * 0.38) *
      (1 - Math.min(0.6, Math.abs(swipeX.value) / 500)),
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
  // Full-bleed artwork: edge to edge at the top, fading into a deep tint of its own colour.
  // Grows past square on tall screens to meet the title, cropping at most a sliver of each side.
  const [artBottom, setArtBottom] = useState(0);
  const heroH = Math.round(
    Math.min(win.width * 1.2, Math.max(win.width, artBottom + 40)),
  );
  const base = deepen(palette.colors[0]);
  const tint = background === "black" ? "#000000" : base;

  return (
    <View style={styles.root}>
      {!lyricsMode ? (
        <Animated.View
          entering={FadeIn.duration(260)}
          style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}
          pointerEvents="none"
        >
          <View style={{ height: heroH, overflow: "hidden" }}>
            <Animated.View style={[StyleSheet.absoluteFill, artStyle]}>
              {hero.uri ? (
                <Image
                  source={hero.uri}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={350}
                  recyclingKey={p.track?.id}
                  onError={hero.next}
                  // YouTube answers a missing HD frame with a 120×90 grey placeholder.
                  onLoad={(e) => e.source.width <= 120 && hero.next()}
                />
              ) : null}
            </Animated.View>
            <LinearGradient
              colors={[`${tint}00`, `${tint}c0`, tint]}
              locations={[0, 0.6, 0.9]}
              style={[styles.fade, { bottom: 0, height: heroH * 0.5 }]}
            />
          </View>
          <LinearGradient
            colors={["rgba(0,0,0,0.42)", "rgba(0,0,0,0)"]}
            style={[styles.scrim, { height: insets.top + 90 }]}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)"]}
            style={[styles.fade, { top: heroH, bottom: 0 }]}
          />
        </Animated.View>
      ) : background === "field" ? (
        <ColorField palette={palette} playing={playing} />
      ) : null}
      {lyricsMode && background === "blur" && art ? (
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
                  setArtBottom(
                    e.nativeEvent.layout.y + e.nativeEvent.layout.height,
                  )
                }
              />
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

// YouTube video stills come letterboxed at 4:3; the 16:9 HD frames don't, so try those first.
function heroCandidates(url?: string, saver?: boolean): string[] {
  if (!url) return [];
  if (saver) return [url];
  const id = url.match(/ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//)?.[1];
  if (!id) return [url];
  return [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hq720.jpg`,
    url,
  ];
}

function useHeroArt(trackId: string | undefined, url?: string, saver = false) {
  const [miss, setMiss] = useState({ key: "", n: 0 });
  const list = heroCandidates(url, saver);
  const n = miss.key === trackId ? miss.n : 0;
  return {
    uri: list[n],
    next: () => setMiss({ key: trackId ?? "", n: n + 1 }),
  };
}

// The artwork's main colour pulled down to a deep tint the controls sit on.
function deepen(color: string): string {
  let rgb: number[];
  if (color.startsWith("#") && color.length === 7) {
    const v = Number.parseInt(color.slice(1), 16);
    rgb = [v >> 16, (v >> 8) & 255, v & 255];
  } else rgb = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  if (rgb.length < 3) return "#111114";
  const k = 58 / Math.max(58, ...rgb);
  const hex = rgb
    .map((c) =>
      Math.round(c * k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
  return `#${hex}`;
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
  // The flash timer outlives later dep changes (loading -> playing right after a skip would otherwise strand it).
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const was = prev.current;
    let next: CatMood | null = null;
    if (liked && !was.liked && was.id === track?.id) next = "happy";
    else if (track?.id !== was.id) {
      const artist = track?.artists[0]?.name;
      const known =
        !!artist &&
        useLibrary
          .getState()
          .history.slice(1)
          .some((h) => h.track.artists[0]?.name === artist);
      next = artist && !known ? "excited" : "curious";
    } else if (status === "playing" && was.status === "paused") next = "yawn";
    prev.current = { liked, id: track?.id, status };
    if (!next) return;
    setFlash(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setFlash(null),
      next === "happy" || next === "excited"
        ? 1600
        : next === "yawn"
          ? 1400
          : 900,
    );
  }, [liked, track, status]);
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
  artArea: { flex: 1, minHeight: 160 },
  scrim: { position: "absolute", left: 0, right: 0, top: 0 },
  fade: { position: "absolute", left: 0, right: 0 },
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
