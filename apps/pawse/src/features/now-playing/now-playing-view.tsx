import {
  artistLine,
  bestThumbnail,
  type Lyrics,
  type Track,
} from "@pawse/music-core";
import {
  getProgress,
  type PlayerSnapshot,
  usePlayerSelect,
  usePlayerStore,
  useProgress,
} from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
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
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { Artwork } from "../../components/artwork";
import { Marquee } from "../../components/marquee";
import { Spinner, useBusy } from "../../components/spinner";
import { useDataSaverActive } from "../../data/downloads";
import { useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { activeLine } from "../../lib/lrc";
import { levelsAvailable } from "../../lib/audio-fx";
import { useSetting } from "../../lib/settings";
import { useSongArt } from "../../lib/song-art";
import { display } from "../../lib/type";
import { useSettled } from "../../lib/use-settled";
import { songVibe } from "../../lib/vibe";
import type { CatMood } from "../cat/cat";
import { WatchIcon } from "../shell/icons";
import { SyncedVideo } from "../video/synced-video";
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
import { useNowPalette } from "./now-palette";
import { SongVideoSwitch } from "./song-video-switch";
import { Visualiser } from "./visualiser";
import { TintStack, useTintPair } from "./tint-fade";

// One Now playing at a time, so the skip fallback timer lives here rather than in a ref the gesture would read.
let giveUp: ReturnType<typeof setTimeout> | undefined;
const cancelGiveUp = () => clearTimeout(giveUp);
const armGiveUp = (fn: () => void) => {
  cancelGiveUp();
  giveUp = setTimeout(fn, 3500);
};

export type NowPlayingStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "error";

export type NowPlayingProps = {
  track?: Track;
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
  /** Opens this song's video where it is (YouTube videos on). */
  onVideo?: () => void;
  /** The Song and Video switch: the song's video shows in place of the artwork, in time with the music. */
  video?: {
    on: boolean;
    /** The video-only playlist, once it's ready. */
    uri?: string;
    failed?: boolean;
    /** The song has no music video: the switch shows that and stays on Song. */
    none?: boolean;
    onChange: (on: boolean) => void;
  };
  /** Tapping the title opens the album; tapping the artist opens the artist. */
  onTitle?: () => void;
  onArtist?: () => void;
  onShareLyric?: (line: string) => void;
};

// Critically damped (damping = 2 * sqrt(stiffness)), so a skip lands on the next art without overshoot.
const SETTLE = {
  stiffness: 320,
  damping: 36,
  mass: 1,
  overshootClamping: true,
};
const RUBBER = 0.25;
/** Windows at least this wide (the desktop app) get the two-column player. */
const WIDE_MIN = 900;

export function NowPlayingView(p: NowPlayingProps) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const saver = useDataSaverActive();
  // Music videos show their song's album cover when one matches, like YouTube Music.
  const thumbs = useSongArt(p.track);
  const art = p.track ? bestThumbnail(thumbs, saver ? 544 : 1080) : undefined;
  const hero = useHeroArt(p.track?.id, art, saver);
  // The app-wide palette: it changes once per song, after the skip has settled.
  const palette = useNowPalette((s) => s.palette);
  const background = useSetting<"field" | "blur" | "black">(
    "npBackground",
    "field",
  );
  const showLine = useSetting("lyricsLine", true);
  const visualiserOn = useSetting("visualiser", false) && levelsAvailable;
  // Loading counts as live, so a skip doesn't dim the art or re-render this screen twice.
  const playing = usePlayerSelect(
    (s) =>
      s.status === "playing" ||
      s.status === "buffering" ||
      s.status === "loading",
  );
  const lyricsMode = p.mode === "lyrics";
  const videoOn = !!p.video?.on && !p.video.none && !lyricsMode;

  // Paused: the artwork dims and settles back a touch.
  const live = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    live.set(withTiming(playing ? 1 : 0, { duration: 420 }));
  }, [playing, live]);

  // Swipe the artwork sideways to skip. It runs on the UI thread: the art follows the finger, the next or
  // previous art peeks in beside it, and a release settles on a critically damped spring from the finger's speed.
  const swipeX = useSharedValue(0);
  const landed = useSharedValue(0);
  const changed = useSharedValue(0);
  const settled = useSettled();
  const nextTrack = usePlayerSelect((s) => neighbour(s, 1));
  const prevTrack = usePlayerSelect((s) => neighbour(s, -1));
  const hasNext = !!nextTrack;
  const hasPrev = !!prevTrack;
  const width = win.width;
  useEffect(() => cancelGiveUp, []);
  // The skip itself: haptic, the player, and a fallback in case the next song never loads.
  const skip = (dir: -1 | 1) => {
    haptic.medium();
    if (dir < 0) p.onNext();
    else p.onPrev();
    // Previous restarts a song that is past its first seconds instead of leaving it: the art comes back.
    if (dir > 0 && getProgress().position > 3) {
      swipeX.set(withSpring(0, SETTLE));
      return;
    }
    armGiveUp(() => {
      if (changed.get() === 0) swipeX.set(withSpring(0, SETTLE));
    });
  };
  // The new song is current: once the art has landed, swap to it in place (it is the picture that peeked).
  const trackId = p.track?.id;
  useEffect(() => {
    changed.set(1);
    cancelGiveUp();
  }, [trackId, changed]);
  useAnimatedReaction(
    () => changed.get() === 1 && landed.get() === 1,
    (done) => {
      if (!done) return;
      swipeX.set(0);
      landed.set(0);
    },
  );
  // Tap the artwork (or its expand button) to see it full screen; tap anywhere to close.
  const [full, setFull] = useState(false);
  const openFull = () => {
    haptic.light();
    setFull(true);
  };
  const swipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      landed.set(0);
      changed.set(0);
    })
    .onUpdate((e) => {
      const dx = e.translationX;
      // Nothing to skip to: the art gives a little, then pulls back.
      const open = dx < 0 ? hasNext : hasPrev;
      swipeX.set(open ? dx : dx * RUBBER);
    })
    .onEnd((e) => {
      const dx = e.translationX;
      const dir = dx < 0 ? -1 : 1;
      const far = Math.abs(dx) > width * 0.3 || Math.abs(e.velocityX) > 700;
      // A flick the other way than the drag doesn't count.
      const agrees = e.velocityX === 0 || e.velocityX < 0 === dx < 0;
      if (far && agrees && (dir < 0 ? hasNext : hasPrev)) {
        swipeX.set(
          withSpring(
            dir * width,
            { ...SETTLE, velocity: e.velocityX },
            (done) => {
              if (done) landed.set(1);
            },
          ),
        );
        scheduleOnRN(skip, dir);
      } else swipeX.set(withSpring(0, { ...SETTLE, velocity: e.velocityX }));
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDuration(300)
    .onEnd((_e, ok) => {
      if (ok && art) openFull();
    });
  // A sideways drag skips; a plain tap opens the artwork.
  const artGesture = Gesture.Exclusive(swipe, tap);
  // Desktop: the square card only dims and settles; skipping is by the buttons.
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + live.get() * 0.03 }],
    opacity: 0.62 + live.get() * 0.38,
  }));
  // Phone: the full-bleed art and its neighbours move together.
  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.get() }, { scale: 1 + live.get() * 0.03 }],
    opacity: 0.62 + live.get() * 0.38,
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
  const tintPair = useTintPair(tint);
  const peekArt = (t?: Track) =>
    t
      ? heroCandidates(
          bestThumbnail(t.thumbnails, saver ? 544 : 1080),
          saver,
        )[0]
      : undefined;
  const prevUri = peekArt(prevTrack);
  const nextUri = peekArt(nextTrack);

  // Desktop: artwork and controls on the left, lyrics always open on the right; Esc closes.
  const wide = win.width >= WIDE_MIN;
  useEffect(() => {
    if (!wide || typeof document === "undefined" || !p.onClose) return;
    const close = p.onClose;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wide, p.onClose]);
  if (wide) {
    const side = Math.max(
      220,
      Math.min(win.height - 340, win.width / 2 - 150, 520),
    );
    return (
      <View style={styles.root}>
        {background === "black" ? null : (
          <ColorField palette={palette} playing={playing} />
        )}
        <View style={[styles.body, styles.wideBody]}>
          <View style={styles.header}>
            <Pressable
              hitSlop={12}
              onPress={p.onClose}
              style={styles.headerBtn}
              accessibilityLabel="Close"
            >
              <ChevronDown color="rgba(255,255,255,0.8)" />
            </Pressable>
            {p.onVideo ? <View style={styles.headerBtn} /> : null}
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
            {p.onVideo ? (
              <Pressable
                hitSlop={8}
                onPress={p.onVideo}
                style={styles.headerBtn}
                accessibilityLabel="Watch the video"
              >
                <WatchIcon size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
            ) : null}
            <Pressable hitSlop={12} onPress={p.onMore} style={styles.headerBtn}>
              <MoreGlyph color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
          <View style={styles.wideMain}>
            <View style={styles.wideLeft}>
              <Animated.View
                style={[
                  styles.wideArt,
                  { width: side, height: side },
                  artStyle,
                ]}
              >
                {art ? (
                  <Image
                    source={art}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={300}
                    recyclingKey={p.track?.id}
                  />
                ) : null}
              </Animated.View>
              <View style={[styles.meta, { width: side, marginTop: 22 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Pressable onPress={p.onTitle} style={styles.link}>
                    <Marquee style={styles.title}>
                      {p.track?.title ?? " "}
                    </Marquee>
                  </Pressable>
                  <Pressable onPress={p.onArtist} style={styles.link}>
                    <Marquee style={styles.artist}>
                      <ArtistText track={p.track} />
                    </Marquee>
                  </Pressable>
                </View>
                {likeButton}
              </View>
              <View style={{ width: side }}>
                <Scrubber
                  track={p.track}
                  liked={p.liked}
                  sourceTitle={p.context?.title}
                  cups={[palette.accent, palette.accentDeep]}
                  onSeek={p.onSeek}
                  onLike={() => !p.liked && like()}
                />
                <View style={styles.transport}>
                  <Btn onPress={p.onPrev}>
                    <PrevGlyph size={38} />
                  </Btn>
                  <Btn onPress={p.onToggle} big>
                    <PlayIcon size={46} />
                  </Btn>
                  <Btn onPress={p.onNext}>
                    <NextGlyph size={38} />
                  </Btn>
                </View>
              </View>
            </View>
            <View style={styles.wideRight}>
              <LyricsView
                lyrics={p.lyrics}
                loading={!!p.lyricsLoading}
                onSeek={p.onSeek}
                onShare={p.onShareLyric}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {!lyricsMode ? (
        <Animated.View
          entering={FadeIn.duration(260)}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <TintStack tint={tintPair} style={StyleSheet.absoluteFill}>
            {(c) => (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />
            )}
          </TintStack>
          <View style={{ height: heroH, overflow: "hidden" }}>
            <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
              {hero.uri ? (
                <Image
                  source={hero.uri}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={350}
                  blurRadius={videoOn ? 40 : 0}
                  recyclingKey={p.track?.id}
                  onError={hero.next}
                  // YouTube answers a missing HD frame with a 120×90 grey placeholder.
                  onLoad={(e) => e.source.width <= 120 && hero.next()}
                />
              ) : null}
              {/* The neighbours wait just off screen, already decoded, for a swipe to bring them in. */}
              {settled && !videoOn && prevUri ? (
                <Image
                  source={prevUri}
                  style={[styles.peek, { left: -width, width }]}
                  contentFit="cover"
                  priority="low"
                />
              ) : null}
              {settled && !videoOn && nextUri ? (
                <Image
                  source={nextUri}
                  style={[styles.peek, { left: width, width }]}
                  contentFit="cover"
                  priority="low"
                />
              ) : null}
              {videoOn ? <View style={styles.videoDim} /> : null}
            </Animated.View>
            {/* The fade into the tint sits over the art; it crossfades with the tint under it. */}
            <TintStack
              tint={tintPair}
              style={[styles.fade, { bottom: 0, height: heroH * 0.5 }]}
            >
              {(c) => (
                <LinearGradient
                  colors={[`${c}00`, `${c}c0`, c]}
                  locations={[0, 0.6, 0.9]}
                  style={StyleSheet.absoluteFill}
                />
              )}
            </TintStack>
            {visualiserOn && !videoOn ? (
              <Visualiser
                color={palette.accent}
                width={win.width - 56}
                style={{ position: "absolute", left: 28, bottom: heroH * 0.06 }}
              />
            ) : null}
          </View>
          {/* Darkens the top of the artwork so the header reads as its own band, off people's faces. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0)"]}
            locations={[0, 0.55, 1]}
            style={[styles.scrim, { height: insets.top + 120 }]}
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
          {p.video && !lyricsMode ? (
            <View style={styles.context}>
              <SongVideoSwitch
                on={p.video.on && !p.video.none}
                none={p.video.none}
                onChange={p.video.onChange}
              />
            </View>
          ) : (
            <>
              {p.onVideo ? <View style={styles.headerBtn} /> : null}
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
              {p.onVideo ? (
                <Pressable
                  hitSlop={8}
                  onPress={p.onVideo}
                  style={styles.headerBtn}
                  accessibilityLabel="Watch the video"
                >
                  <WatchIcon size={20} color="rgba(255,255,255,0.8)" />
                </Pressable>
              ) : null}
            </>
          )}
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
                <Artwork thumbnails={thumbs} size={56} radius={8} />
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Marquee style={styles.compactTitle}>
                  {p.track?.title ?? ""}
                </Marquee>
                <Marquee style={styles.compactArtist}>
                  {p.track ? artistLine(p.track.artists) : ""}
                </Marquee>
              </View>
              {likeButton}
            </View>
            <View style={{ flex: 1 }}>
              <LyricsView
                lyrics={p.lyrics}
                loading={!!p.lyricsLoading}
                onSeek={p.onSeek}
                onShare={p.onShareLyric}
              />
            </View>
          </Animated.View>
        ) : (
          <>
            <GestureDetector gesture={artGesture}>
              <View
                style={styles.artArea}
                onLayout={(e) =>
                  setArtBottom(
                    e.nativeEvent.layout.y + e.nativeEvent.layout.height,
                  )
                }
              >
                {videoOn ? (
                  <Animated.View
                    entering={FadeIn.duration(300)}
                    style={[
                      styles.videoBox,
                      { height: ((win.width - 32) * 9) / 16 },
                    ]}
                  >
                    {p.video?.uri ? (
                      <SyncedVideo
                        key={p.video.uri}
                        uri={p.video.uri}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : (
                      <Text style={styles.videoNote}>
                        {p.video?.failed
                          ? "This video won't play right now."
                          : "Loading video…"}
                      </Text>
                    )}
                  </Animated.View>
                ) : null}
                {videoOn && p.onVideo ? (
                  <Pressable
                    hitSlop={10}
                    onPress={p.onVideo}
                    style={styles.expand}
                    accessibilityLabel="Open the full video"
                  >
                    <ExpandGlyph />
                  </Pressable>
                ) : art && !videoOn ? (
                  <Pressable
                    hitSlop={10}
                    onPress={openFull}
                    style={styles.expand}
                    accessibilityLabel="Show artwork full screen"
                  >
                    <ExpandGlyph />
                  </Pressable>
                ) : null}
              </View>
            </GestureDetector>

            <View style={styles.meta}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Pressable
                  onPress={p.onTitle}
                  style={({ pressed }) => [
                    styles.link,
                    pressed && styles.metaPressed,
                  ]}
                  accessibilityRole="link"
                  accessibilityHint="Opens the album"
                >
                  <Animated.View
                    key={`t${p.track?.id}`}
                    entering={FadeInDown.duration(320)}
                  >
                    <Marquee style={styles.title} fadeColor={tint}>
                      {p.track?.title ?? " "}
                    </Marquee>
                  </Animated.View>
                </Pressable>
                <Pressable
                  onPress={p.onArtist}
                  style={({ pressed }) => [
                    styles.link,
                    pressed && styles.metaPressed,
                  ]}
                  accessibilityRole="link"
                  accessibilityHint="Opens the artist"
                >
                  <Animated.View
                    key={`a${p.track?.id}`}
                    entering={FadeInDown.duration(380).delay(40)}
                  >
                    <Marquee style={styles.artist} fadeColor={tint}>
                      <ArtistText track={p.track} />
                    </Marquee>
                  </Animated.View>
                </Pressable>
              </View>
              {likeButton}
            </View>

            <Pressable onPress={p.onLyrics} style={styles.singing}>
              {showLine ? <SingingLine lyrics={p.lyrics} /> : null}
            </Pressable>
          </>
        )}

        <Scrubber
          track={p.track}
          liked={p.liked}
          sourceTitle={p.context?.title}
          cups={[palette.accent, palette.accentDeep]}
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
            <PlayIcon size={52} />
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

      {full && art ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(180)}
          style={StyleSheet.absoluteFill}
        >
          <StatusBar hidden animated />
          <Pressable
            style={styles.full}
            onPress={() => setFull(false)}
            accessibilityLabel="Close artwork"
          >
            <Animated.View
              entering={ZoomIn.duration(280)}
              style={StyleSheet.absoluteFill}
            >
              <Image
                source={hero.uri ?? art}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
              />
            </Animated.View>
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]}
              style={[styles.fullFade, { paddingBottom: insets.bottom + 28 }]}
            >
              <Text style={styles.fullTitle} numberOfLines={2}>
                {p.track?.title}
              </Text>
              <Text style={styles.fullArtist} numberOfLines={1}>
                {p.track ? artistLine(p.track.artists) : ""}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

// Status and progress are read here, so their frequent changes re-render only the wire and its cat.
function Scrubber({
  track,
  liked,
  sourceTitle,
  cups,
  onSeek,
  onLike,
}: {
  track?: Track;
  liked: boolean;
  sourceTitle?: string;
  cups: [string, string];
  onSeek: (sec: number) => void;
  onLike: () => void;
}) {
  const status = usePlayerSelect((s) => s.status);
  const { position, duration } = useProgress();
  const mood = useCatMood(status, liked, track, sourceTitle);
  return (
    <CatScrubber
      position={position}
      duration={duration || track?.durationSec || 0}
      mood={mood}
      cups={cups}
      playing={status === "playing" || status === "buffering"}
      trackId={track?.id}
      onSeek={onSeek}
      onLike={onLike}
    />
  );
}

// Spinner once loading lasts a moment, otherwise play or pause.
function PlayIcon({ size }: { size: number }) {
  const status = usePlayerSelect((s) => s.status);
  const busy = useBusy(status);
  if (busy !== "no") return <Spinner size={40} width={4} />;
  return status === "playing" || status === "buffering" ? (
    <PauseGlyph size={size} />
  ) : (
    <PlayGlyph size={size} />
  );
}

// The artist line, or a note when loading drags on.
function ArtistText({ track }: { track?: Track }) {
  const busy = useBusy(usePlayerSelect((s) => s.status));
  if (!track) return " ";
  return busy === "slow"
    ? "Still loading, the connection is slow…"
    : artistLine(track.artists);
}

// The line being sung, under the title; it follows progress on its own.
function SingingLine({ lyrics }: { lyrics?: Lyrics | null }) {
  const { position } = useProgress();
  const lines = lyrics?.synced ? lyrics.lines : [];
  const li = activeLine(lines, position * 1000);
  if (li < 0 || !lines[li].text) return null;
  return (
    <Animated.Text
      key={li}
      entering={FadeInDown.duration(380)}
      exiting={FadeOut.duration(200)}
      style={styles.singingText}
      numberOfLines={1}
    >
      {lines[li].text}
    </Animated.Text>
  );
}

function ExpandGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// The song before or after this one in the queue (wrapping when the queue repeats), if there is one to peek at.
function neighbour(s: PlayerSnapshot, dir: 1 | -1): Track | undefined {
  const n = s.queue.length;
  if (n < 2) return undefined;
  let i = s.index + dir;
  if (i < 0 || i >= n) {
    if (s.repeat !== "all") return undefined;
    i = (i + n) % n;
  }
  return s.queue[i];
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

// Dance to the song's mood while playing, sleep when paused, yawn on resume, a hop on like, excited for a new artist.
function useCatMood(
  status: NowPlayingStatus,
  liked: boolean,
  track?: Track,
  sourceTitle?: string,
): CatMood {
  const [flash, setFlash] = useState<CatMood | null>(null);
  const fading = usePlayerStore((s) => s.sleepFading);
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
  if (fading) return "sleep";
  if (flash) return flash;
  if (status === "playing") return songVibe(track, sourceTitle);
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
    ...display("700"),
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  contextTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 1,
  },
  artArea: { flex: 1, minHeight: 160, justifyContent: "center" },
  // Edge to edge across the player's side padding.
  // No fill: the blurred artwork shows around a 4:3 or vertical picture instead of black bars.
  // A rounded card, not a hard-cut strip across the screen.
  videoBox: {
    marginHorizontal: -12,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  videoNote: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    ...display("700"),
  },
  videoDim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scrim: { position: "absolute", left: 0, right: 0, top: 0 },
  peek: { position: "absolute", top: 0, bottom: 0 },
  fade: { position: "absolute", left: 0, right: 0 },
  meta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  title: {
    color: "#fff",
    fontSize: 24,
    ...display("700"),
    letterSpacing: -0.3,
  },
  // Only the text itself is tappable, not the empty space beside it.
  link: { alignSelf: "flex-start", maxWidth: "100%" },
  metaPressed: { opacity: 0.55 },
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
  wideBody: { paddingTop: 14, paddingBottom: 24, paddingHorizontal: 36 },
  wideMain: { flex: 1, flexDirection: "row", gap: 48, minHeight: 0 },
  wideLeft: { flex: 1, alignItems: "center", justifyContent: "center" },
  wideArt: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
  },
  wideRight: { flex: 1, maxWidth: 620, paddingVertical: 12 },
  expand: {
    position: "absolute",
    right: 0,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  full: { flex: 1, backgroundColor: "#000" },
  fullFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 120,
    paddingHorizontal: 28,
  },
  fullTitle: { color: "#fff", fontSize: 26, ...display("800") },
  fullArtist: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 17,
    marginTop: 4,
  },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  compactTitle: { color: "#fff", fontSize: 17, ...display("700") },
  compactArtist: { color: "rgba(255,255,255,0.6)", fontSize: 15, marginTop: 1 },
});
