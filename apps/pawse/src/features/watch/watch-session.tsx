import type { SkipSegment } from "@pawse/innertube";
import {
  bestThumbnail,
  type Track,
  type VideoDetail,
  type VideoItem,
} from "@pawse/music-core";
import { player as music, usePlayerStore } from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { showSheet } from "../../components/action-sheet";
import { Spinner } from "../../components/spinner";
import { showToast } from "../../components/toast";
import {
  CatState,
  PressScale,
  SectionTitle,
  Skeleton,
} from "../../components/ui";
import {
  clock,
  openChannel,
  VideoRow,
  videoMeta,
} from "../../components/video-card";
import { recordWatch, resumeAt } from "../../data/watched";
import { useVideoFilter } from "../../lib/block";
import { skipNote, useBranding, videoSkips } from "../../lib/community";
import { logEvent } from "../../lib/diagnostics";
import { compact, useVotes } from "../../lib/dislikes";
import { ytv } from "../../lib/engine";
import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import {
  type Quality,
  type VideoSource,
  videoSource,
} from "../../lib/video-stream";
import { useWatchPlayer, VideoSurface } from "../video/watch-player";
import { closeWatch, minimizeWatch, openWatch, useWatch } from "./store";

const MAX_W = 980;
// Room above the page for a pull-down bounce, so the glow never shows a gap.
const OVERSCROLL = 600;
// A drag this far down (or a flick) shrinks the video into the mini player.
const DISMISS_PX = 110;
const DISMISS_V = 900;

/** One watch session: the video full screen over the whole app, or shrunk into the mini player while it keeps playing. */
export function WatchSession({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const mode = useWatch((s) => s.mode);
  const seed = useWatch((s) => s.seed);
  const t = useWatch((s) => s.t);
  const pref = useSetting("videoPreferred", "auto");
  const autoplay = useSetting("videoAutoplay", false);
  const w = Math.min(width, MAX_W);
  const detail = useResource<VideoDetail>(`video:${id}`, () => ytv.video(id));
  const [quality, setQuality] = useState<Quality>(
    typeof pref === "number" ? pref : "auto",
  );
  const [loaded, setLoaded] = useState<{
    src?: VideoSource;
    error?: string;
    /** Where playback picks up: the song's spot at first, the current spot after a quality switch. */
    start?: number;
  }>();
  const src = loaded?.src;
  const error = loaded?.error;
  const [ended, setEnded] = useState(false);
  const [started, setStarted] = useState(false);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const atRef = useRef(0);
  const [track, setTrack] = useState<string>();
  const [frame, setFrame] = useState<string>();
  const skips = useRef<SkipSegment[]>([]);
  const keep = useVideoFilter();
  const brand = useBranding(id);

  const setError = (message: string) => {
    logEvent("video-failed", `${id}: ${message}`);
    setLoaded({ error: message });
  };
  // Sponsor reads and plugs are jumped over as playback reaches them.
  const savedAt = useRef(0);
  const onTime = (sec: number) => {
    setAt(sec);
    atRef.current = sec;
    // Progress is kept every few seconds, so Home can offer to continue.
    if (Math.abs(sec - savedAt.current) > 8) {
      savedAt.current = sec;
      recordWatch({
        id,
        title: brand?.title ?? v?.title ?? seed?.title ?? "",
        thumbnails: v?.thumbnails ?? seed?.thumbnails ?? [],
        channel: v?.channel ?? seed?.channel,
        pos: sec,
        dur: src?.stream.durationSec ?? v?.durationSec ?? 0,
      });
    }
    if (sec > 0 && !started) setStarted(true);
    const seg = skips.current.find((g) => sec >= g.start && sec < g.end - 0.5);
    if (!seg) return;
    video.seek(seg.end);
    showToast(skipNote(seg.category));
  };

  const d = detail.data;
  const v = d?.video;
  const related = d?.related.filter(keep) ?? [];
  const next = related[0];
  const onEnd = () => {
    if (autoplay && next) return openWatch(next);
    setEnded(true);
  };

  const video = useWatchPlayer({
    uri: src?.uri,
    headers: src?.stream.headers,
    startAt: loaded?.start,
    onTime,
    onEnd,
    onError: setError,
    onFrame: setFrame,
    onTrack: (h, fps) => setTrack(`${h}p${(fps ?? 30) > 30 ? "60" : ""}`),
    onPlaying: (on) => useWatch.setState({ playing: on }),
  });

  // The mini player shows and controls this same player.
  useEffect(() => {
    useWatch.setState({ player: video });
  }, [video]);
  const title = brand?.title ?? v?.title ?? seed?.title;
  useEffect(() => {
    useWatch.setState({
      title,
      channel: v?.channel?.name ?? seed?.channel?.name,
    });
  }, [title, v?.channel?.name, seed?.channel?.name]);

  useEffect(() => {
    let live = true;
    void videoSkips(id).then((s) => {
      if (live) skips.current = s;
    });
    return () => {
      live = false;
    };
  }, [id]);

  // A video takes over from the music; music starting again closes a video waiting in the mini player.
  useEffect(() => {
    const st = usePlayerStore.getState().status;
    if (st === "playing" || st === "buffering" || st === "loading")
      music.pause();
    return usePlayerStore.subscribe((s, prev) => {
      if (s.status !== "playing" || prev.status === "playing") return;
      video.pause();
      if (useWatch.getState().mode === "mini") closeWatch();
    });
  }, [video]);

  // The old quality keeps playing until the new one is ready, then it carries on from the same moment.
  useEffect(() => {
    let live = true;
    videoSource(id, quality)
      .then(
        (s) =>
          live &&
          setLoaded((was) => ({
            src: s,
            start: was?.src ? atRef.current : (t ?? resumeAt(id)),
          })),
      )
      .catch((e: Error) => {
        logEvent("video-failed", `${id}: ${e.message}`);
        if (live) setLoaded({ error: e.message });
      });
    return () => {
      live = false;
    };
    // t only matters for the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, quality]);

  // Slides up when opened, down into the mini player when shrunk; a drag on the video follows the finger.
  const y = useSharedValue(height);
  useEffect(() => {
    y.set(withTiming(mode === "full" ? 0 : height, { duration: 280 }));
  }, [mode, height, y]);
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onUpdate((e) => y.set(Math.max(0, e.translationY)))
    .onEnd((e) => {
      if (e.translationY > DISMISS_PX || e.velocityY > DISMISS_V) {
        haptic.light();
        minimizeWatch();
      } else y.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });
  const sheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { scale: interpolate(y.value, [0, height], [1, 0.9], "clamp") },
    ],
    borderRadius: interpolate(y.value, [0, 160], [0, 28], "clamp"),
  }));

  // Back (Android) and Esc (computers) shrink the video rather than lose it.
  useEffect(() => {
    if (mode !== "full") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      minimizeWatch();
      return true;
    });
    if (typeof document === "undefined") return () => sub.remove();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && minimizeWatch();
    document.addEventListener("keydown", onKey);
    return () => {
      sub.remove();
      document.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  const qualityLabel =
    src?.quality === "auto"
      ? track
        ? `Auto · ${track}`
        : "Auto"
      : (src?.quality ?? "Quality");
  const pickQuality = () => {
    if (!src) return;
    const choose = (q: Quality) => () => setQuality(q);
    showSheet({
      header: <Text style={styles.sheetTitle}>Quality</Text>,
      actions: [
        {
          label: src.quality === "auto" ? `✓  ${qualityLabel}` : "Auto",
          sub: "Changes with your connection",
          onPress: choose("auto"),
        },
        ...src.options.map((o) => ({
          label: src.quality === o.key ? `✓  ${o.key}` : o.key,
          onPress: choose(o.key),
        })),
      ],
    });
  };
  const share = () => {
    haptic.light();
    void Share.share({
      url: `https://youtu.be/${id}`,
      message: `https://youtu.be/${id}`,
    });
  };
  const listen = () => {
    if (!v) return;
    haptic.light();
    const song: Track = {
      id: v.id,
      source: "youtube",
      title: v.title,
      artists: [{ id: v.channel?.id, name: v.channel?.name ?? "YouTube" }],
      durationSec: src?.stream.durationSec ?? v.durationSec,
      thumbnails: v.thumbnails,
      kind: "video",
    };
    closeWatch();
    void music.play([song], 0, {
      source: { type: "other", title: "From Watch" },
    });
  };

  const thumb =
    bestThumbnail(v?.thumbnails ?? seed?.thumbnails ?? [], 720) ??
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  // The glow follows the playing picture where a player can share frames, else the thumbnail.
  const glow = frame ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const stageH = (w * 9) / 16;
  const chapter = d?.chapters.reduce<number>(
    (cur, c, i) => (c.startSec <= at ? i : cur),
    -1,
  );

  return (
    <Animated.View
      style={[styles.root, sheet]}
      pointerEvents={mode === "full" ? "auto" : "none"}
    >
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          alignItems: "center",
        }}
      >
        <Ambient uri={glow} height={insets.top + stageH + 220} />
        <View style={{ width: w }}>
          {/* Full width like YouTube; drag the video down to keep it playing in the mini player. */}
          <GestureDetector gesture={drag}>
            <View style={{ paddingTop: insets.top }}>
              <View style={[styles.stage, { height: stageH }]}>
                {src && mode === "full" ? (
                  <VideoSurface
                    surface={video.surface}
                    controls
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
                {!started ? (
                  <View style={styles.veil} pointerEvents="none">
                    <Image
                      source={thumb}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      blurRadius={error ? 12 : 0}
                    />
                    {error ? (
                      <Text style={styles.veilText}>
                        This video won’t play right now.
                      </Text>
                    ) : (
                      <View style={styles.spin}>
                        <Spinner size={30} />
                      </View>
                    )}
                  </View>
                ) : null}
                {ended ? (
                  <EndCard
                    next={next}
                    onReplay={() => {
                      setEnded(false);
                      video.replay();
                    }}
                    onNext={() => next && openWatch(next)}
                    onDone={closeWatch}
                  />
                ) : null}
              </View>
            </View>
          </GestureDetector>

          {v ? (
            <Animated.View entering={FadeInDown.duration(360)}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.meta}>{videoMeta(v, false)}</Text>
              <View style={styles.channel}>
                <Pressable
                  onPress={() => {
                    const cid = v.channel?.id;
                    if (!cid) return;
                    minimizeWatch();
                    openChannel(cid);
                  }}
                  style={styles.channelHit}
                >
                  {v.channel?.avatar ? (
                    <Image
                      source={bestThumbnail(v.channel.avatar, 88)}
                      style={styles.avatar}
                    />
                  ) : null}
                  <Text style={styles.channelName} numberOfLines={1}>
                    {v.channel?.name}
                  </Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.actions}
              >
                <VoteBar id={id} />
                <Pill
                  icon={<GearGlyph />}
                  label={qualityLabel}
                  onPress={pickQuality}
                />
                <Pill
                  icon={<HeadphonesGlyph />}
                  label="Listen"
                  onPress={listen}
                />
                <Pill icon={<ShareGlyph />} label="Share" onPress={share} />
              </ScrollView>
            </Animated.View>
          ) : detail.error ? (
            <CatState
              kind="error"
              message="Couldn't open this video."
              action="Try again"
              onAction={detail.reload}
            />
          ) : (
            <DetailSkeleton title={seed?.title} />
          )}

          {d?.chapters.length ? (
            <View>
              <SectionTitle title="Chapters" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chapters}
              >
                {d.chapters.map((c, i) => (
                  <PressScale
                    key={`${c.startSec}${i}`}
                    onPress={() => video.seek(c.startSec)}
                    style={[styles.chapter, i === chapter && styles.chapterOn]}
                  >
                    <Text style={styles.chapterTime}>
                      {clock(c.startSec) || "0:00"}
                    </Text>
                    <Text style={styles.chapterTitle} numberOfLines={2}>
                      {c.title}
                    </Text>
                  </PressScale>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {d?.description ? (
            <Pressable onPress={() => setOpen(!open)} style={styles.desc}>
              <Text
                style={styles.descText}
                numberOfLines={open ? undefined : 3}
              >
                {d.description}
              </Text>
              <Text style={styles.more}>{open ? "Less" : "More"}</Text>
            </Pressable>
          ) : null}

          {related.length ? (
            <View>
              <SectionTitle title="Up next" />
              {related.slice(0, 12).map((r) => (
                <VideoRow key={r.id} video={r} onPress={() => openWatch(r)} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// The page's shape while it loads: the title (or the one the card already knew), the channel, the buttons, Up next.
function DetailSkeleton({ title }: { title?: string }) {
  return (
    <View style={styles.skeleton}>
      {title ? (
        <Text style={[styles.title, styles.flush]}>{title}</Text>
      ) : (
        <>
          <Skeleton w="92%" h={18} r={6} />
          <Skeleton w="60%" h={18} r={6} style={{ marginTop: 8 }} />
        </>
      )}
      <Skeleton w="45%" h={12} r={5} style={{ marginTop: 12 }} />
      <View style={styles.skelRow}>
        <Skeleton w={38} h={38} r={19} />
        <Skeleton w={140} h={14} r={5} />
      </View>
      <View style={styles.skelRow}>
        <Skeleton w={150} h={36} r={18} />
        <Skeleton w={110} h={36} r={18} />
        <Skeleton w={90} h={36} r={18} />
      </View>
      <Skeleton w={110} h={20} r={6} style={{ marginTop: 34 }} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skelRow}>
          <Skeleton w={150} h={84} r={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton w="90%" h={14} r={5} />
            <Skeleton w="70%" h={14} r={5} />
            <Skeleton w="50%" h={11} r={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Pill({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} style={styles.pill}>
      {icon}
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}

const GearGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 7h10M18 7h2M4 17h4M12 17h8"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
    />
    <Path
      d="M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
      stroke="#fff"
      strokeWidth={2}
    />
  </Svg>
);

const ShareGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M14 5l7 7-7 7M21 12H10a6 6 0 0 0-6 6v1"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// Likes beside Return YouTube Dislike's estimate, with a thin bar of the share that liked it.
function VoteBar({ id }: { id: string }) {
  const v = useVotes(id);
  if (!v) return null;
  const share = v.likes + v.dislikes ? v.likes / (v.likes + v.dislikes) : 1;
  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      style={[styles.pill, styles.votes]}
    >
      <Thumb up />
      <Text style={styles.voteText}>{compact(v.likes)}</Text>
      <Thumb />
      <Text style={styles.voteText}>{compact(v.dislikes)}</Text>
      <View style={styles.voteTrack}>
        <View style={[styles.voteFill, { width: `${share * 100}%` }]} />
      </View>
    </Animated.View>
  );
}

const Thumb = ({ up }: { up?: boolean }) => (
  <Svg
    width={15}
    height={15}
    viewBox="0 0 24 24"
    fill="none"
    style={up ? undefined : { transform: [{ rotate: "180deg" }] }}
  >
    <Path
      d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"
      stroke="rgba(255,255,255,0.75)"
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </Svg>
);

// When a video ends nothing starts by itself: replay, go on, or stop here.
function EndCard({
  next,
  onReplay,
  onNext,
  onDone,
}: {
  next?: VideoItem;
  onReplay: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.end}>
      <View style={styles.endRow}>
        <PressScale onPress={onReplay} style={styles.endBtn}>
          <Text style={styles.endText}>Replay</Text>
        </PressScale>
        {next ? (
          <PressScale onPress={onNext} style={styles.endBtn}>
            <Text style={styles.endText}>Next</Text>
          </PressScale>
        ) : null}
        <PressScale onPress={onDone} style={[styles.endBtn, styles.endDone]}>
          <Text style={[styles.endText, { color: "#000" }]}>Done</Text>
        </PressScale>
      </View>
      {next ? (
        <Text style={styles.endNext} numberOfLines={1}>
          Next: {next.title}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const HeadphonesGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zm16 0a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z"
      stroke="#fff"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/** YouTube's ambient mode: the picture, blurred past recognition, lighting the black around the player. */
function Ambient({ uri, height }: { uri: string; height: number }) {
  const total = height + OVERSCROLL;
  return (
    <View
      pointerEvents="none"
      style={[styles.ambient, { top: -OVERSCROLL, height: total }]}
    >
      <Image
        source={uri}
        style={styles.ambientImage}
        contentFit="cover"
        blurRadius={48}
        transition={1400}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", "#000"]}
        locations={[0, (OVERSCROLL + height * 0.55) / total, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the whole app, above the tabs; slides down into the mini player.
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  spin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  skeleton: { paddingHorizontal: 16, paddingTop: 18 },
  skelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
  },
  flush: { marginTop: 0, marginHorizontal: 0 },
  ambient: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  // Scaled past the edges so the blur doesn't fade to dark at the sides.
  ambientImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.85,
    transform: [{ scale: 1.35 }],
  },
  stage: { backgroundColor: "#000", overflow: "hidden" },
  sheetTitle: {
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    marginBottom: 4,
    ...display("800"),
  },
  veil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  veilText: { color: "#fff", fontSize: 14, ...display("700") },
  title: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 25,
    marginTop: 16,
    marginHorizontal: 16,
    ...display("800"),
  },
  meta: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13.5,
    marginTop: 5,
    marginHorizontal: 16,
  },
  actions: { gap: 8, paddingHorizontal: 16, marginTop: 14 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  pillText: { color: "#fff", fontSize: 14, ...display("700") },
  votes: { gap: 6 },
  voteText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginRight: 8,
    ...display("700"),
  },
  voteTrack: {
    width: 44,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  voteFill: { height: 3, backgroundColor: "rgba(255,255,255,0.75)" },
  channel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    marginHorizontal: 16,
  },
  channelHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#222" },
  channelName: { flex: 1, color: "#fff", fontSize: 15.5, ...display("700") },
  chapters: { gap: 10, paddingHorizontal: 16 },
  chapter: {
    width: 150,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  chapterOn: { backgroundColor: "rgba(255,255,255,0.2)" },
  chapterTime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    ...display("700"),
  },
  chapterTitle: {
    color: "#fff",
    fontSize: 13.5,
    marginTop: 4,
    ...display("700"),
  },
  desc: {
    marginHorizontal: 16,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  descText: { color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 20 },
  more: { color: "#fff", fontSize: 13, marginTop: 6, ...display("800") },
  end: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  endRow: { flexDirection: "row", gap: 10 },
  endBtn: {
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  endDone: { backgroundColor: "#fff" },
  endText: { color: "#fff", fontSize: 14, ...display("800") },
  endNext: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12.5,
    maxWidth: "80%",
  },
});
