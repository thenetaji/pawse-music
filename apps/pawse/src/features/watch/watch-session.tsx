import type { SkipSegment } from "@pawse/innertube";
import {
  bestThumbnail,
  type VideoDetail,
  type VideoItem,
} from "@pawse/music-core";
import { player as music, usePlayerStore } from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
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
  Easing,
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
  VideoCard,
  VideoRow,
} from "../../components/video-card";
import { ytAccount } from "../../data/clients";
import {
  downloadVideo,
  removeDownload,
  useVideoDownload,
} from "../../data/downloads";
import { useLibrary } from "../../data/library";
import {
  rateVideo,
  recordWatch,
  resumeAt,
  useVideoRating,
  videoTrack,
} from "../../data/watched";
import { useVideoFilter } from "../../lib/block";
import { skipNote, useBranding, videoSkips } from "../../lib/community";
import { logEvent } from "../../lib/diagnostics";
import { useVotes } from "../../lib/dislikes";
import { ytv } from "../../lib/engine";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { setSetting, useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import {
  type Quality,
  type VideoSource,
  videoSource,
} from "../../lib/video-stream";
import { showPlaylistPicker } from "../library/playlist-tools";
import {
  enterFullscreen,
  useWatchPlayer,
  VideoSurface,
} from "../video/watch-player";
import {
  closeWatch,
  minimizeWatch,
  openWatch,
  useWatch,
  watchPrevious,
} from "./store";
import { VideoControls } from "./video-controls";
import {
  CommentsCard,
  CommentsPanel,
  DescriptionPanel,
  short,
  useComments,
} from "./watch-panels";

type Rating = "like" | "dislike" | "none";

const MAX_W = 980;
// A drag this far down (or a flick) shrinks the video into the mini player; this far up goes full screen.
const DISMISS_PX = 110;
const DISMISS_V = 900;
const FULL_PX = 70;
// Eased, no bounce: the page glides between full and the mini player.
const SLIDE = { duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
const SETTLE = { damping: 26, stiffness: 240 };

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
  const [at, setAt] = useState(0);
  const atRef = useRef(0);
  const [track, setTrack] = useState<string>();
  const [frame, setFrame] = useState<string>();
  const skips = useRef<SkipSegment[]>([]);
  const keep = useVideoFilter();
  const brand = useBranding(id);
  const calm = useSetting("videoCalm", false);
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  // Phones keep the video pinned at the top; wide screens scroll it with the page.
  const pinned = width < 900;
  const [panel, setPanel] = useState<"comments" | "description" | null>(null);
  const votes = useVotes(id);

  const setError = (message: string) => {
    logEvent("video-failed", `${id}: ${message}`);
    setLoaded({ error: message });
  };
  // Sponsor reads and plugs are jumped over as playback reaches them.
  const savedAt = useRef(0);
  const onTime = (sec: number) => {
    setAt(sec);
    atRef.current = sec;
    const dur = src?.stream.durationSec ?? v?.durationSec;
    if (dur) useWatch.setState({ progress: Math.min(1, sec / dur) });
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
  const comments = useComments(id, calm ? undefined : d?.comments);
  // Your like and subscription, changed here before YouTube's copy of the page catches up.
  const [mine, setMine] = useState<{ rating?: Rating; subscribed?: boolean }>(
    {},
  );
  // Likes are kept on the phone too, so they work signed out; signed in they go to YouTube as well.
  const local = useVideoRating(id);
  const rating: Rating =
    mine.rating ?? (local !== "none" ? local : (d?.rating ?? "none"));
  const subscribed = mine.subscribed ?? d?.subscribed ?? false;
  const base = d?.likes ?? votes?.likes;
  const likes =
    base === undefined
      ? undefined
      : base + (rating === "like" ? 1 : 0) - (d?.rating === "like" ? 1 : 0);
  const rate = (r: Rating) => {
    if (!v) return;
    haptic.light();
    setMine((m) => ({ ...m, rating: r }));
    rateVideo({ ...v, title: title ?? v.title }, r);
    if (r === "like") showToast("Added to Liked videos");
    if (signedIn)
      ytAccount
        .rate(id, r)
        .catch(() => showToast("Saved here; YouTube didn’t take it"));
  };
  const toggleSubscribe = () => {
    const cid = v?.channel?.id;
    if (!cid) return;
    haptic.light();
    const on = !subscribed;
    setMine((m) => ({ ...m, subscribed: on }));
    ytAccount.subscribe(cid, on).catch(() => {
      setMine((m) => ({ ...m, subscribed: !on }));
      showToast("Couldn't save that");
    });
  };
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
      // The same song coming back by itself while the video plays is the system resuming it: the video wins.
      const resumed =
        prev.status === "paused" &&
        s.index === prev.index &&
        s.tracks === prev.tracks;
      if (resumed && useWatch.getState().playing) {
        music.pause();
        return;
      }
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
    y.set(withTiming(mode === "full" ? 0 : height, SLIDE));
  }, [mode, height, y]);
  // Our own full screen: the video turned on its side over everything (phones), the browser's elsewhere.
  const [fs, setFs] = useState(false);
  const fullscreen = Platform.OS !== "web" || width < 600;
  const toggleFs = () => {
    haptic.light();
    if (!fullscreen) return enterFullscreen();
    setFs((f) => !f);
  };
  // Down shrinks the video into the mini player, up goes full screen, like YouTube. Built once, not per frame.
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onUpdate((e) => y.set(Math.max(0, e.translationY) * 0.85))
        .onEnd((e) => {
          if (e.translationY > DISMISS_PX || e.velocityY > DISMISS_V) {
            haptic.light();
            minimizeWatch();
            return;
          }
          y.set(withSpring(0, SETTLE));
          if (
            fullscreen &&
            (e.translationY < -FULL_PX || e.velocityY < -DISMISS_V)
          ) {
            haptic.light();
            setFs(true);
          }
        }),
    [y, fullscreen, setFs],
  );
  const sheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { scale: interpolate(y.value, [0, height], [1, 0.94], "clamp") },
    ],
    opacity: interpolate(y.value, [height * 0.6, height], [1, 0], "clamp"),
    borderRadius: interpolate(y.value, [0, 120], [0, 24], "clamp"),
  }));

  // Back (Android) and Esc (computers) close a panel, then shrink the video rather than lose it.
  useEffect(() => {
    if (mode !== "full") return;
    const back = () =>
      fs ? setFs(false) : panel ? setPanel(null) : minimizeWatch();
    if (typeof document === "undefined") {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        back();
        return true;
      });
      return () => sub.remove();
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && back();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, panel, fs]);

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
  const [speed, setSpeed] = useState(1);
  const pickSpeed = () =>
    showSheet({
      header: <Text style={styles.sheetTitle}>Playback speed</Text>,
      actions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => ({
        label: `${r === speed ? "✓  " : ""}${r === 1 ? "Normal" : `${r}×`}`,
        onPress: () => {
          setSpeed(r);
          video.setRate(r);
        },
      })),
    });
  const pickSettings = () =>
    showSheet({
      actions: [
        { label: "Quality", sub: qualityLabel, onPress: pickQuality },
        {
          label: "Playback speed",
          sub: speed === 1 ? "Normal" : `${speed}×`,
          onPress: pickSpeed,
        },
      ],
    });
  const playing = useWatch((s) => s.playing);
  const hasBack = useWatch((s) => s.back.length > 0);
  const share = () => {
    haptic.light();
    void Share.share({
      url: `https://youtu.be/${id}`,
      message: `https://youtu.be/${id}`,
    });
  };
  // Saved with the title shown here (DeArrow's, when it has one).
  const asTrack = () =>
    videoTrack(
      {
        id,
        title: title ?? "",
        thumbnails: v?.thumbnails ?? seed?.thumbnails ?? [],
        channel: v?.channel ?? seed?.channel,
      },
      src?.stream.durationSec ?? v?.durationSec,
    );
  const listen = () => {
    if (!v) return;
    haptic.light();
    closeWatch();
    void music.play([asTrack()], 0, {
      source: { type: "other", title: "From Watch" },
    });
  };
  // A downloaded video plays offline in the music player, its picture on the Video side.
  const playOffline = () => {
    closeWatch();
    setSetting("npVideo", true);
    void music.play([asTrack()], 0, {
      source: { type: "other", title: "Downloads" },
    });
    push("/now-playing");
  };
  const dl = useVideoDownload(id);
  const offlineCopy = dl.state === "done";
  const downloadLabel =
    dl.state === "done"
      ? "Downloaded"
      : dl.state === "downloading" || dl.state === "queued"
        ? `${Math.round(dl.progress * 100)}%`
        : dl.state === "error"
          ? "Retry"
          : "Download";
  const pickDownload = () => {
    haptic.light();
    if (dl.state === "done")
      return showSheet({
        actions: [
          { label: "Play offline", onPress: playOffline },
          {
            label: "Remove download",
            destructive: true,
            onPress: () => removeDownload(id),
          },
        ],
      });
    if (dl.state === "downloading" || dl.state === "queued")
      return showSheet({
        actions: [
          {
            label: "Cancel download",
            destructive: true,
            onPress: () => removeDownload(id),
          },
        ],
      });
    const st = src?.stream;
    const sizes = new Map<number, number | undefined>();
    for (const p of st?.variants ?? []) {
      const h = p.height ?? 0;
      if (h > 1080 || (sizes.has(h) && (p.fps ?? 30) > 30)) continue;
      sizes.set(
        h,
        p.contentLength && st?.audio.contentLength
          ? p.contentLength + st.audio.contentLength
          : undefined,
      );
    }
    const heights = sizes.size ? [...sizes.keys()] : [720, 480, 360];
    const go = (h: number) => () => {
      downloadVideo(asTrack(), h);
      showToast("Downloading. It’ll be in Downloads.");
    };
    showSheet({
      header: <Text style={styles.sheetTitle}>Download</Text>,
      actions: heights
        .filter((h) => h >= 144)
        .map((h) => ({
          label: `${h}p`,
          sub: sizes.get(h) ? `About ${mb(sizes.get(h)!)}` : undefined,
          onPress: go(h),
        })),
    });
  };
  const save = () => {
    haptic.light();
    showPlaylistPicker([asTrack()]);
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

  const screen = (
    <>
      {src && mode === "full" ? (
        <VideoSurface
          surface={video.surface}
          controls
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {src && started && !ended && mode === "full" ? (
        <VideoControls
          at={at}
          dur={src.stream.durationSec ?? v?.durationSec}
          playing={playing}
          chapters={d?.chapters ?? []}
          canPrev={at > 3 || hasBack}
          canNext={!!next}
          autoplay={autoplay}
          onToggle={video.toggle}
          onSeek={video.seek}
          onPrev={() => (at > 3 ? video.seek(0) : watchPrevious())}
          onNext={() => next && openWatch(next)}
          onMinimize={minimizeWatch}
          onSettings={pickSettings}
          onFullscreen={toggleFs}
          fullscreen={fs}
          getTime={video.time}
          onAutoplay={(on) => {
            setSetting("videoAutoplay", on);
            showToast(on ? "Autoplay is on" : "Autoplay is off");
          }}
        />
      ) : null}
      {!started ? (
        <View style={styles.veil} pointerEvents="none">
          <Image
            source={thumb}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={error ? 12 : undefined}
          />
          {error && offlineCopy ? null : error ? (
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
      {error && offlineCopy ? (
        <View style={styles.veil}>
          <PressScale onPress={playOffline} style={styles.offlineBtn}>
            <Text style={styles.offlineText}>Play the downloaded copy</Text>
          </PressScale>
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
    </>
  );
  const stage = (
    // Drag the video down to keep it playing in the mini player, or up for full screen.
    <GestureDetector gesture={drag}>
      <View style={[styles.stage, { width: w, height: stageH }]}>
        {fs ? null : screen}
      </View>
    </GestureDetector>
  );

  const details = (
    <>
      <Ambient uri={glow} />
      {v ? (
        <Animated.View entering={FadeInDown.duration(320)}>
          <Pressable
            onPress={() => setPanel("description")}
            style={styles.info}
          >
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {(calm ? [v.publishedText] : [v.viewsText, v.publishedText])
                .filter(Boolean)
                .join(" · ")}
              <Text style={styles.metaMore}> ...more</Text>
            </Text>
          </Pressable>
          <View style={styles.channel}>
            <Pressable
              onPress={() => v.channel?.id && openChannel(v.channel.id)}
              style={styles.channelHit}
            >
              {v.channel?.avatar ? (
                <Image
                  source={bestThumbnail(v.channel.avatar, 88)}
                  style={styles.avatar}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {v.channel?.name}
                </Text>
                {d?.subscribersText && !calm ? (
                  <Text style={styles.subs} numberOfLines={1}>
                    {d.subscribersText}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {signedIn && v.channel?.id ? (
              <PressScale
                onPress={toggleSubscribe}
                style={[styles.subBtn, subscribed && styles.subBtnOn]}
              >
                <Text style={[styles.subText, subscribed && styles.subTextOn]}>
                  {subscribed ? "Subscribed" : "Subscribe"}
                </Text>
              </PressScale>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actions}
          >
            <LikePill
              likes={calm ? undefined : likes}
              dislikes={calm ? undefined : votes?.dislikes}
              rating={rating}
              onRate={rate}
            />
            <Pill icon={<ShareGlyph />} label="Share" onPress={share} />
            {Platform.OS !== "web" ? (
              <Pill
                icon={<DownloadGlyph done={offlineCopy} />}
                label={downloadLabel}
                onPress={pickDownload}
              />
            ) : null}
            <Pill icon={<SaveGlyph />} label="Save" onPress={save} />
            <Pill
              icon={<GearGlyph />}
              label={qualityLabel}
              onPress={pickQuality}
            />
            <Pill icon={<HeadphonesGlyph />} label="Listen" onPress={listen} />
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
      ) : null}

      {!calm && d?.comments ? (
        <CommentsCard
          page={comments.data}
          onPress={() => setPanel("comments")}
        />
      ) : null}

      {!calm && related.length ? (
        <View style={styles.upNext}>
          {pinned ? (
            related.slice(0, 16).map((r) => <VideoCard key={r.id} video={r} />)
          ) : (
            <>
              <SectionTitle title="Up next" />
              {related.slice(0, 16).map((r) => (
                <VideoRow key={r.id} video={r} onPress={() => openWatch(r)} />
              ))}
            </>
          )}
        </View>
      ) : null}
    </>
  );

  const sheetPanel =
    panel === "comments" ? (
      <CommentsPanel
        first={comments.data}
        onClose={() => setPanel(null)}
        onSeek={video.seek}
      />
    ) : panel === "description" && d ? (
      <DescriptionPanel
        detail={d}
        title={title}
        likes={calm ? undefined : likes}
        onClose={() => setPanel(null)}
        onSeek={video.seek}
      />
    ) : null;

  return (
    <Animated.View
      style={[styles.root, sheet]}
      pointerEvents={mode === "full" ? "auto" : "none"}
    >
      {pinned ? (
        // Phones: the video stays at the top like YouTube's; only the page below it scrolls.
        <>
          <View style={{ height: insets.top, backgroundColor: "#000" }} />
          {stage}
          <View style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            >
              {details}
            </ScrollView>
            {sheetPanel}
          </View>
        </>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              paddingTop: insets.top,
              paddingBottom: insets.bottom + 40,
              alignItems: "center",
            }}
          >
            {stage}
            <View style={{ width: w }}>{details}</View>
          </ScrollView>
          {sheetPanel ? (
            <View style={[styles.side, { top: insets.top }]}>{sheetPanel}</View>
          ) : null}
        </>
      )}
      {fs && mode === "full" ? (
        <FullscreenLayer onExit={() => setFs(false)}>{screen}</FullscreenLayer>
      ) : null}
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

const mb = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

const DownloadGlyph = ({ done }: { done?: boolean }) => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d={
        done
          ? "M5 12.5l4.5 4.5L19 7.5"
          : "M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"
      }
      stroke="#fff"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SaveGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 6h11M4 12h11M4 18h7M18 14v7M14.5 17.5h7"
      stroke="#fff"
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </Svg>
);

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

// Like and dislike in one pill, like YouTube's; counts are hidden on the calm page.
function LikePill({
  likes,
  dislikes,
  rating,
  onRate,
}: {
  likes?: number;
  dislikes?: number;
  rating: Rating;
  onRate: (r: Rating) => void;
}) {
  return (
    <View style={[styles.pill, styles.likePill]}>
      <Pressable
        onPress={() => onRate(rating === "like" ? "none" : "like")}
        style={styles.likeHalf}
        accessibilityLabel="Like"
      >
        <Thumb up on={rating === "like"} />
        {likes !== undefined ? (
          <Text style={styles.pillText}>{short(likes)}</Text>
        ) : null}
      </Pressable>
      <View style={styles.likeRule} />
      <Pressable
        onPress={() => onRate(rating === "dislike" ? "none" : "dislike")}
        style={styles.likeHalf}
        accessibilityLabel="Dislike"
      >
        <Thumb on={rating === "dislike"} />
        {dislikes !== undefined ? (
          <Text style={styles.pillText}>{short(dislikes)}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const Thumb = ({ up, on }: { up?: boolean; on?: boolean }) => (
  <Svg
    width={17}
    height={17}
    viewBox="0 0 24 24"
    fill="none"
    style={up ? undefined : { transform: [{ rotate: "180deg" }] }}
  >
    <Path
      d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"
      stroke="#fff"
      fill={on ? "#fff" : "none"}
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

/** Landscape without rotating the app: the video turned on its side over everything, status bar hidden.
 * Swipe down (in the turned picture) to leave, like YouTube. */
function FullscreenLayer({
  children,
  onExit,
}: {
  children: React.ReactNode;
  onExit: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const exit = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(16)
        .failOffsetX([-30, 30])
        .onEnd((e) => {
          if (e.translationY > 70 || e.velocityY > 800) {
            haptic.light();
            onExit();
          }
        }),
    [onExit],
  );
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.full}>
      <StatusBar hidden />
      <GestureDetector gesture={exit}>
        <View
          style={{
            position: "absolute",
            width: height,
            height: width,
            left: (width - height) / 2,
            top: (height - width) / 2,
            // Turned clockwise: the notch ends up on the left, the home bar on the right.
            paddingLeft: insets.top,
            paddingRight: insets.bottom,
            transform: [{ rotate: "90deg" }],
          }}
        >
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/** YouTube's ambient mode: the picture, blurred past recognition, glowing out from under the video onto black. */
function Ambient({ uri }: { uri: string }) {
  return (
    <View pointerEvents="none" style={styles.ambient}>
      <Image
        source={uri}
        style={styles.ambientImage}
        contentFit="cover"
        blurRadius={48}
        transition={1400}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.7)", "#000"]}
        locations={[0, 0.5, 1]}
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
  ambient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    overflow: "hidden",
  },
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
  full: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000",
    zIndex: 10,
  },
  // Not clipped, so the seek bar's handle can sit on the video's bottom edge like YouTube's.
  stage: { backgroundColor: "#000", zIndex: 2 },
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
  offlineBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  offlineText: { color: "#000", fontSize: 14, ...display("800") },
  info: { paddingHorizontal: 12, paddingTop: 12 },
  title: { color: "#fff", fontSize: 18, lineHeight: 23, ...display("800") },
  meta: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, marginTop: 5 },
  metaMore: { color: "#fff", fontWeight: "700" },
  actions: { gap: 8, paddingHorizontal: 12, marginTop: 12 },
  likePill: { paddingHorizontal: 0, gap: 0 },
  likeHalf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 36,
    paddingHorizontal: 14,
  },
  likeRule: { width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.25)" },
  subs: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 1 },
  subBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  subBtnOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  subText: { color: "#000", fontSize: 14, ...display("800") },
  subTextOn: { color: "#fff" },
  upNext: { marginTop: 20 },
  side: { position: "absolute", right: 0, bottom: 0, width: 420 },
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
  channel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    marginHorizontal: 12,
  },
  channelHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#222" },
  channelName: { flex: 1, color: "#fff", fontSize: 15.5, ...display("700") },
  chapters: { gap: 10, paddingHorizontal: 12, marginTop: 16 },
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
