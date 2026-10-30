import type { SkipSegment } from "@pawse/innertube";
import {
  bestThumbnail,
  StreamError,
  type VideoDetail,
  type VideoItem,
} from "@pawse/music-core";
import { player as music, usePlayerStore } from "@pawse/player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import CircleArrowDown from "lucide-react-native/icons/circle-arrow-down";
import CircleCheck from "lucide-react-native/icons/circle-check";
import Headphones from "lucide-react-native/icons/headphones";
import ListPlus from "lucide-react-native/icons/list-plus";
import ShareIcon from "lucide-react-native/icons/share";
import Sparkles from "lucide-react-native/icons/sparkles";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import ThumbsDownIcon from "lucide-react-native/icons/thumbs-down";
import ThumbsUpIcon from "lucide-react-native/icons/thumbs-up";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
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
import { scheduleOnRN } from "react-native-worklets";
import { SheetNote, showSheet } from "../../components/action-sheet";
import { CloseGlyph, DeArrowMark } from "../../components/glyphs";
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
import { useSubscribed } from "../../data/channels";
import { ytAccount } from "../../data/clients";
import {
  downloadVideo,
  removeVideoDownload,
  useVideoDownload,
} from "../../data/downloads";
import { useLibrary } from "../../data/library";
import { recordSpot } from "../../data/list-spots";
import { isPinned, togglePin } from "../../data/pins";
import {
  rateVideo,
  recordWatch,
  resumeAt,
  useVideoRating,
  videoTrack,
} from "../../data/watched";
import { useVideoFilter } from "../../lib/block";
import { useAiFeature } from "../../lib/ai/model";
import { useBranding, useHighlight, videoSkips } from "../../lib/community";
import { logEvent } from "../../lib/diagnostics";
import { useVotes } from "../../lib/dislikes";
import { ytv } from "../../lib/engine";
import { noteWatching, useFocus } from "../../lib/focus";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { networkKind } from "../../lib/net";
import {
  allowRotation,
  lockLandscape,
  lockPortrait,
  onTurn,
} from "../../lib/orientation";
import { isLowData } from "../../lib/quality";
import { startLevels, stopLevels } from "../../lib/screen-levels";
import { setSetting, useSetting } from "../../lib/settings";
import { toggleSubscription } from "../../lib/subscribe";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { reportsWatching, reportWatching } from "../../lib/youtube-history";
import {
  forgetStream,
  prepareStream,
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
import { SummaryPanel } from "./ai-summary";
import { useAiChapters, useCaptionPrefetch, useSponsorSpots } from "./ai-watch";
import { setCaptions, useCaptions } from "./captions";
import {
  communityMenu,
  HighlightPill,
  skipToast,
  useCrowdDetail,
} from "./community";
import { type MenuPage, PlayerMenu } from "./player-menu";
import {
  closeWatch,
  minimizeWatch,
  openWatch,
  setWatchFill,
  setWatchFullscreen,
  unqueueWatch,
  useWatch,
  type WatchSeed,
  watchPrevious,
} from "./store";
import { SponsorPrompt } from "./sponsor-prompt";
import { StoryboardFrame } from "./storyboard";
import { LEAVE_V, makeClock, SIDE, VideoControls } from "./video-controls";
import {
  CommentsCard,
  DescriptionCard,
  CommentsPanel,
  DescriptionPanel,
  short,
  useComments,
} from "./watch-panels";

const msUntil = (at: number) => Math.max(0, at - Date.now());

type Rating = "like" | "dislike" | "none";

const MAX_W = 980;
// A buffer must last this long before the spinner shows.
const SPIN_MS = 300;
// The next video is prepared this long after this one starts, so it never competes with it.
const PREPARE_MS = 4000;
// A drag this far down (or a flick) shrinks the video into the mini player; this far up goes full screen.
const DISMISS_PX = 110;
const DISMISS_V = 900;
const FULL_PX = 70;
// Eased, no bounce: the page glides between full and the mini player.
const SLIDE = { duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
// Critically damped and clamped: the page settles without overshooting.
const SETTLE = { damping: 32, stiffness: 240, overshootClamping: true };

/** True once `on` has held for `ms`; false the moment it stops. */
function useAfter(on: boolean, ms: number) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setLate(true), ms);
    return () => {
      clearTimeout(t);
      setLate(false);
    };
  }, [on, ms]);
  return on && late;
}

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
  // The audio language picked from the menu; the original until then.
  const [audioTrack, setAudioTrack] = useState<string>();
  const [loaded, setLoaded] = useState<{
    src?: VideoSource;
    error?: string;
    /** What to tell you when YouTube said why it won't play. */
    why?: string;
    /** Asking again won't help (private, removed, blocked here): no Try again, only Next. */
    final?: boolean;
    /** Where playback picks up: the song's spot at first, the current spot after a quality switch. */
    start?: number;
  }>();
  const src = loaded?.src;
  const error = loaded?.error;
  const [ended, setEnded] = useState(false);
  const [reload, setReload] = useState(0);
  const [started, setStarted] = useState(false);
  // Waiting for more video after it started: a spinner over the picture, like YouTube.
  const [buffering, setBuffering] = useState(false);
  // Only once it has lasted: a quick buffer shouldn't flash the spinner.
  const lagging = useAfter(buffering, SPIN_MS);
  // The position ticks twice a second; only the controls follow it, so the page doesn't re-render with it.
  const [playClock] = useState(makeClock);
  const atRef = useRef(0);
  const [pastStart, setPastStart] = useState(false);
  const [chapter, setChapter] = useState(-1);
  const [track, setTrack] = useState<string>();
  const [frame, setFrame] = useState<string>();
  const skips = useRef<SkipSegment[]>([]);
  const keep = useVideoFilter();
  const brand = useBranding(id);
  const highlight = useHighlight(id);
  const focus = useFocus();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  // Phones keep the video pinned at the top; wide screens scroll it with the page.
  const pinned = width < 900;
  const [panel, setPanel] = useState<
    "comments" | "description" | "summary" | null
  >(null);
  const votes = useVotes(id);

  // The local playlist server can be gone after the phone slept; one quiet retry gets a fresh one.
  const retried = useRef(false);
  const setError = (message: string) => {
    logEvent("video-failed", `${id}: ${message}`);
    if (!retried.current && /connect to the server/i.test(message)) {
      retried.current = true;
      return freshStream();
    }
    setLoaded((was) => ({ ...was, error: message }));
  };
  // Sponsor reads and plugs are jumped over as playback reaches them.
  const savedAt = useRef(0);
  const keepSpot = (sec: number) => {
    savedAt.current = sec;
    recordWatch({
      id,
      title: brand?.title ?? v?.title ?? seed?.title ?? "",
      thumbnails: v?.thumbnails ?? seed?.thumbnails ?? [],
      channel: v?.channel ?? seed?.channel,
      pos: sec,
      dur: src?.stream.durationSec ?? v?.durationSec ?? 0,
    });
  };
  // A fresh stream after an error, picking up where it stopped.
  const retry = () => {
    haptic.light();
    freshStream();
  };
  function freshStream() {
    forgetStream();
    setStarted(false);
    setLoaded({ start: atRef.current > 0 ? atRef.current : undefined });
    setReload((n) => n + 1);
  }
  const onTime = (sec: number, loaded?: number) => {
    playClock.set(sec, loaded);
    atRef.current = sec;
    setPastStart(sec > 3);
    setChapter(
      d?.chapters.reduce<number>(
        (cur, c, i) => (c.startSec <= sec ? i : cur),
        -1,
      ) ?? -1,
    );
    if (noteWatching()) {
      video.pause();
      showSheet({
        header: (
          <SheetNote
            title="Time for a break?"
            body="You asked Pawse to check in. The video is paused."
          />
        ),
        actions: [
          { label: "Keep watching", onPress: () => video.toggle() },
          { label: "Close the video", onPress: closeWatch },
        ],
      });
    }
    const dur = src?.stream.durationSec ?? v?.durationSec;
    if (dur) useWatch.setState({ progress: Math.min(1, sec / dur) });
    // Progress is kept every few seconds, so Home can offer to continue.
    if (Math.abs(sec - savedAt.current) > 8) keepSpot(sec);
    if (sec > 0 && !started) setStarted(true);
    const seg = skips.current.find((g) => sec >= g.start && sec < g.end - 0.5);
    if (!seg) return;
    // Each segment skips once: going back into it means you want to watch it.
    skips.current = skips.current.filter((g) => g !== seg);
    video.seek(seg.end);
    skipToast(seg, id);
  };

  const crowd = useCrowdDetail(id, detail.data);
  const d = useAiChapters(
    id,
    src?.stream.captions,
    src?.stream.durationSec ?? crowd?.video.durationSec,
    crowd,
  );
  const v = d?.video;
  const sponsorSpots = useSponsorSpots(id, src?.stream.captions);
  const canSummarize =
    useAiFeature("aiSummary") && !!src?.stream.captions?.length;
  useCaptionPrefetch(id, src?.stream.captions, canSummarize);
  const comments = useComments(id, focus.comments ? d?.comments : undefined);
  // Your like and subscription, changed here before YouTube's copy of the page catches up.
  const [mine, setMine] = useState<{ rating?: Rating }>({});
  // Likes are kept on the phone too, so they work signed out; signed in they go to YouTube as well.
  const local = useVideoRating(id);
  const rating: Rating =
    mine.rating ?? (local !== "none" ? local : (d?.rating ?? "none"));
  const subscribed = useSubscribed(v?.channel?.id, d?.subscribed);
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
    if (!cid || !v?.channel) return;
    haptic.light();
    const { name, avatar } = v.channel;
    // Signed out, the subscription lives on this phone and feeds Home.
    toggleSubscription({ id: cid, name, avatar }, subscribed);
  };
  const related = d?.related.filter(keep) ?? [];
  // A playlist opened from its page plays in order, whatever autoplay says; its end is the end.
  const list = useWatch((s) => s.list);
  const listAt = list ? list.items.findIndex((x) => x.id === id) : -1;
  const inList = listAt >= 0 ? list : undefined;
  const listNext = inList?.items[listAt + 1];
  // Videos you lined up play first, then the playlist or Up next.
  const queue = useWatch((s) => s.queue);
  const queued = queue.length > 0;
  const next = queue[0]
    ? asVideo(queue[0])
    : inList
      ? listNext && asVideo(listNext)
      : related[0];
  // Where the Next button goes when this video can't play; Focus mode's hidden Up next stays hidden.
  const upNext = focus.upNext || inList || queued ? next : undefined;
  // While this one plays the next is made ready, its stream and its picture, so it starts at once.
  // Not offline or on low mobile data; the stream's urls expire, so it's only kept a few minutes.
  const nextId = next?.id;
  const nextPic = next && bestThumbnail(next.thumbnails, 720);
  useEffect(() => {
    if (!started || !nextId || networkKind() === "offline" || isLowData())
      return;
    const t = setTimeout(() => {
      prepareStream(nextId);
      if (nextPic) void Image.prefetch(nextPic);
    }, PREPARE_MS);
    return () => clearTimeout(t);
  }, [started, nextId, nextPic]);
  // Autoplay counts down on the end card, with a cancel, like YouTube; minimised it just goes on.
  const [autoNext, setAutoNext] = useState(false);
  const onEnd = () => {
    const w = useWatch.getState();
    if (w.loop) return video.replay();
    // A sleep timer set for the end of the video stops here, without going on to the next.
    if (w.sleep === "end") {
      useWatch.setState({ sleep: undefined });
      showToast("Sleep timer: paused");
      return setEnded(true);
    }
    if ((autoplay || inList || queued) && next) {
      if (useWatch.getState().mode === "mini")
        return openWatch(next, undefined, { keepMode: true });
      setAutoNext(true);
    }
    setEnded(true);
  };
  // Where you are in the playlist, for its Resume button.
  const listId = inList?.id;
  const listTitle = inList?.items[listAt]?.title;
  useEffect(() => {
    if (listId) recordSpot(listId, id, listTitle);
  }, [listId, id, listTitle]);

  const video = useWatchPlayer({
    uri: src?.uri,
    headers: src?.stream.headers,
    startAt: loaded?.start,
    onTime,
    onEnd,
    onError: setError,
    onFrame: setFrame,
    onTrack: (h, fps) => setTrack(`${h}p${(fps ?? 30) > 30 ? "60" : ""}`),
    onPlaying: (on) => {
      useWatch.setState({ playing: on });
      if (on) {
        setEnded(false);
        setAutoNext(false);
      }
    },
    onBuffering: setBuffering,
    meta: {
      title: seed?.title,
      artist: seed?.channel?.name,
      artwork: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    },
  });
  // The sleep timer pauses the video at its time, whichever video is playing then.
  const sleep = useWatch((s) => s.sleep);
  useEffect(() => {
    if (typeof sleep !== "number") return;
    const t = setTimeout(() => {
      video.pause();
      useWatch.setState({ sleep: undefined });
      showToast("Sleep timer: paused");
    }, msUntil(sleep));
    return () => clearTimeout(t);
  }, [sleep, video]);
  // The chosen speed carries on from video to video.
  const speed = useWatch((s) => s.speed);
  useEffect(() => {
    if (started && speed !== 1) video.setRate(speed);
  }, [started, speed, video]);
  // Signed in, what you watch goes to your YouTube history with your spot, like the YouTube app.
  useEffect(() => {
    if (!started || !reportsWatching()) return;
    return reportWatching(
      id,
      () => atRef.current,
      () => useWatch.getState().playing,
    );
  }, [id, started]);
  // Press and hold the picture: 2x while the finger is down, like YouTube, then back to your speed.
  const hold2x = (on: boolean) => {
    if (on && !useWatch.getState().playing) video.toggle();
    video.setRate(on ? 2 : useWatch.getState().speed);
  };
  // Closing (or the next video replacing this one) keeps your exact spot too.
  const keepRef = useRef(keepSpot);
  useEffect(() => {
    keepRef.current = keepSpot;
  });
  useEffect(
    () => () => {
      if (atRef.current > 5) keepRef.current(atRef.current);
    },
    [],
  );

  // Minimising keeps the exact spot for Continue watching, not the last 8-second save.
  useEffect(() => {
    if (mode === "mini" && atRef.current > 0) keepSpot(atRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
    videoSource(id, quality, audioTrack)
      .then(
        (s) =>
          live &&
          setLoaded((was) => ({
            src: s,
            start: was?.src ? atRef.current : (was?.start ?? t ?? resumeAt(id)),
          })),
      )
      .catch((e: Error) => {
        logEvent("video-failed", `${id}: ${e.message}`);
        if (live) setLoaded({ error: e.message, ...whyNot(e) });
      });
    return () => {
      live = false;
    };
    // t only matters for the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, quality, reload, audioTrack]);

  // Slides up when opened, down into the mini player when shrunk; a drag on the video follows the finger.
  // Swapping videos on an open page shows the new one in place; opening one slides it up.
  const y = useSharedValue(useWatch.getState().swapped ? 0 : height);
  // Let go of a drag: the spring that took over keeps going instead of restarting as a slide.
  const flung = useSharedValue(false);
  // A spring picks up the finger's speed when a drag lets go; opening from a tap slides as before.
  useEffect(() => {
    if (flung.get()) flung.set(false);
    else y.set(withTiming(mode === "full" ? 0 : height, SLIDE));
  }, [mode, height, y, flung]);
  // Our own full screen: the video turned on its side over everything (phones), the browser's elsewhere.
  // It lives in the store so the next video keeps it, and so does the zoom.
  const fs = useWatch((s) => s.fullscreen);
  const fill = useWatch((s) => s.fill);
  const fsPad = useFullscreenPad();
  const fullscreen = Platform.OS !== "web" || width < 600;
  // Turned sideways by hand (not the button): turning upright again leaves.
  const [byTurn, setByTurn] = useState(false);
  // Left full screen on purpose while holding the phone sideways: don't jump straight back in.
  const [upright, setUpright] = useState(false);
  const enterFs = (turned: boolean) => {
    setByTurn(turned);
    setWatchFill(false);
    setWatchFullscreen(true);
  };
  const exitFs = () => {
    setUpright(true);
    setWatchFullscreen(false);
  };
  const toggleFs = () => {
    haptic.light();
    if (!fullscreen) return enterFullscreen();
    if (fs) exitFs();
    else enterFs(false);
  };
  // Turning the phone sideways on the watch page goes full screen, as on YouTube (rotation lock respected).
  useEffect(() => {
    if (Platform.OS === "web" || mode !== "full" || fs || !started || upright)
      return;
    allowRotation();
    const off = onTurn((sideways) => sideways && enterFs(true));
    return () => {
      off();
      lockPortrait();
    };
  }, [mode, fs, started, upright]);
  // Down shrinks the video into the mini player, up goes full screen, like YouTube. Built once, not per frame.
  // Runs on the UI thread, so the page sticks to the finger even while JS is busy.
  const drag = useMemo(() => {
    const shrink = () => {
      haptic.light();
      minimizeWatch();
    };
    const grow = () => {
      haptic.light();
      setWatchFill(false);
      setWatchFullscreen(true);
    };
    return Gesture.Pan()
      .maxPointers(1)
      .activeOffsetY([-18, 18])
      .failOffsetX([-24, 24])
      .onUpdate((e) => {
        // Down follows the finger; up gives a little, a hint that it goes full screen.
        y.set(
          e.translationY > 0
            ? e.translationY * 0.85
            : Math.max(-10, e.translationY * 0.08),
        );
      })
      .onEnd((e) => {
        if (e.translationY > DISMISS_PX || e.velocityY > DISMISS_V) {
          flung.set(true);
          y.set(withSpring(height, { ...SETTLE, velocity: e.velocityY }));
          scheduleOnRN(shrink);
          return;
        }
        y.set(withSpring(0, { ...SETTLE, velocity: e.velocityY }));
        if (
          fullscreen &&
          (e.translationY < -FULL_PX || e.velocityY < -DISMISS_V)
        )
          scheduleOnRN(grow);
      });
  }, [y, fullscreen, height, flung]);
  const sheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { scale: interpolate(y.value, [0, height], [1, 0.9], "clamp") },
    ],
    opacity: interpolate(y.value, [height * 0.6, height], [1, 0], "clamp"),
    borderRadius: interpolate(y.value, [0, 120], [0, 24], "clamp"),
  }));

  // Back (Android) and Esc (computers) close a panel, then shrink the video rather than lose it.
  useEffect(() => {
    if (mode !== "full") return;
    const back = () =>
      fs ? exitFs() : panel ? setPanel(null) : minimizeWatch();
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
  const cc = useCaptions(src?.stream.captions);
  // Every chapter with its picture (from the scrubber's frames), the playing one ticked; tap to jump.
  const pickChapters = () => {
    const chapters = d?.chapters;
    if (!chapters?.length) return;
    const sb = src?.stream.storyboard;
    showSheet({
      title: "Chapters",
      actions: chapters.map((c, i) => ({
        label: c.title,
        sub: (clock(c.startSec) || "0:00") + (c.ai ? " · AI" : ""),
        checked: i === chapter,
        icon: sb ? (
          <StoryboardFrame sb={sb} sec={c.startSec} scale={0.6} />
        ) : undefined,
        onPress: () => video.seek(c.startSec, true),
      })),
    });
  };
  const tracks = src?.stream.audioTracks;
  const where = () => ({
    id,
    getTime: video.time,
    durationSec: src?.stream.durationSec ?? v?.durationSec,
    storyboard: src?.stream.storyboard,
    title,
  });
  // YouTube's settings sheet: a list of settings, each opening its own page inside the same sheet.
  const openMenu = (page?: MenuPage) => {
    if (!src) return;
    showSheet({
      header: (
        <PlayerMenu
          page={page}
          quality={{ current: src.quality, now: track, options: src.options }}
          onQuality={setQuality}
          onSpeed={(r) => {
            useWatch.setState({ speed: r });
            video.setRate(r);
          }}
          captions={cc.tracks}
          audio={tracks && { tracks, current: src.stream.audioTrack }}
          onAudio={setAudioTrack}
          onCommunity={() => communityMenu(where())}
          pin={{
            on: isPinned(id),
            toggle: () =>
              togglePin({
                kind: "video",
                id,
                title: title ?? "",
                thumbnails: v?.thumbnails ?? seed?.thumbnails ?? [],
              }),
          }}
        />
      ),
      actions: [],
    });
  };
  const playing = useWatch((s) => s.playing);
  const hasBack = useWatch((s) => s.back.length > 0);
  const share = () => {
    haptic.light();
    const link = `https://youtu.be/${id}`;
    // iOS shares the url on its own; a message too would paste the link twice.
    void Share.share(Platform.OS === "ios" ? { url: link } : { message: link });
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
    // The audio picks up where the video was, like YouTube Music's switch.
    const from = atRef.current;
    closeWatch();
    void music
      .play([asTrack()], 0, {
        source: { type: "other", title: "From Watch" },
      })
      .then(() => from > 5 && music.seekTo(from));
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
            onPress: () => removeVideoDownload(id),
          },
        ],
      });
    if (dl.state === "downloading" || dl.state === "queued")
      return showSheet({
        actions: [
          {
            label: "Cancel download",
            destructive: true,
            onPress: () => removeVideoDownload(id),
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

  const screen = (
    <>
      {src && mode === "full" ? (
        <VideoSurface
          surface={video.surface}
          controls
          fill={fs && fill}
          style={[
            StyleSheet.absoluteFill,
            // In full screen the picture sits on the whole screen, not just the part the controls use.
            fs && {
              left: -fsPad.left,
              right: -fsPad.right,
              bottom: -fsPad.bottom,
            },
          ]}
        />
      ) : null}
      {src && started && !ended && mode === "full" ? (
        <VideoControls
          clock={playClock}
          dur={src.stream.durationSec ?? v?.durationSec}
          playing={playing}
          chapters={d?.chapters ?? []}
          canPrev={pastStart || hasBack}
          canNext={!!next}
          autoplay={autoplay}
          onToggle={video.toggle}
          onSeek={video.seek}
          onPrev={() => (atRef.current > 3 ? video.seek(0) : watchPrevious())}
          onNext={() => next && openWatch(next)}
          // In full screen the chevron leaves full screen, like YouTube's.
          onMinimize={fs ? exitFs : minimizeWatch}
          onSettings={() => openMenu()}
          onFullscreen={toggleFs}
          fullscreen={fs}
          onZoom={setWatchFill}
          onHold={hold2x}
          title={fs ? title : undefined}
          cc={cc.available ? cc.on : undefined}
          cues={cc.cues}
          storyboard={src.stream.storyboard}
          highlight={highlight?.at}
          onBestPart={() => {
            if (highlight) video.seek(highlight.at, true);
          }}
          chapter={chapter >= 0 ? d?.chapters[chapter]?.title : undefined}
          onChapters={pickChapters}
          onCc={() => setCaptions(!cc.on)}
          channel={fs ? v?.channel?.name : undefined}
          getTime={video.time}
          onAutoplay={(on) => {
            setSetting("videoAutoplay", on);
            showToast(on ? "Autoplay is on" : "Autoplay is off");
          }}
        />
      ) : null}
      {src && started && !ended && mode === "full" ? (
        <HighlightPill
          at={highlight?.at}
          clock={playClock}
          onJump={(sec) => video.seek(sec, true)}
        />
      ) : null}
      {src && started && !ended && mode === "full" && sponsorSpots.length ? (
        <SponsorPrompt
          spots={sponsorSpots}
          clock={playClock}
          videoId={id}
          durationSec={src.stream.durationSec ?? v?.durationSec}
          onSkip={(sec) => video.seek(sec, true)}
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
          {error ? null : (
            <View style={styles.spin}>
              <Spinner size={30} />
            </View>
          )}
        </View>
      ) : null}
      {error ? (
        <View style={[styles.veil, styles.failed]}>
          <Text style={styles.veilText}>
            {loaded?.why ?? "This video won’t play right now."}
          </Text>
          <View style={styles.failRow}>
            {upNext ? (
              <PressScale
                onPress={() => openWatch(upNext)}
                style={styles.offlineBtn}
              >
                <Text style={styles.offlineText}>Next</Text>
              </PressScale>
            ) : null}
            {loaded?.final ? null : (
              <PressScale onPress={retry} style={styles.offlineBtn}>
                <Text style={styles.offlineText}>Try again</Text>
              </PressScale>
            )}
            {offlineCopy ? (
              <PressScale onPress={playOffline} style={styles.offlineBtn}>
                <Text style={styles.offlineText}>Play the downloaded copy</Text>
              </PressScale>
            ) : null}
          </View>
        </View>
      ) : null}
      {started && lagging && !ended && !error ? (
        <View style={styles.buffering} pointerEvents="none">
          <View style={styles.spin}>
            <Spinner size={30} />
          </View>
        </View>
      ) : null}
      {ended ? (
        <EndCard
          next={focus.upNext || inList || queued || autoNext ? next : undefined}
          countdown={autoNext}
          onCancel={() => setAutoNext(false)}
          onReplay={() => {
            setEnded(false);
            setAutoNext(false);
            video.replay();
          }}
          onNext={() => next && openWatch(next, undefined, { keepMode: true })}
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
            <View style={styles.metaRow}>
              {brand?.dearrow || brand?.thumbnail ? (
                <Pressable
                  hitSlop={10}
                  accessibilityLabel="Changed by DeArrow"
                  onPress={() =>
                    communityMenu(where(), brand.dearrow ? v.title : undefined)
                  }
                >
                  <DeArrowMark size={13} />
                </Pressable>
              ) : null}
              {/* With the detail loaded, views, age and "more" live in the description card. */}
              {d ? null : (
                <Text style={styles.metaText} numberOfLines={1}>
                  {(focus.counts
                    ? [v.viewsText, v.publishedText]
                    : [v.publishedText]
                  )
                    .filter(Boolean)
                    .join(" · ")}
                  <Text style={styles.metaMore}> ...more</Text>
                </Text>
              )}
            </View>
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
                {d?.subscribersText && focus.counts ? (
                  <Text style={styles.subs} numberOfLines={1}>
                    {d.subscribersText}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {v.channel?.id ? (
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
              likes={focus.counts ? likes : undefined}
              dislikes={focus.counts ? votes?.dislikes : undefined}
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
              onPress={() => openMenu("quality")}
            />
            <Pill icon={<HeadphonesGlyph />} label="Listen" onPress={listen} />
            {canSummarize ? (
              <Pill
                icon={<Sparkles size={17} color="#fff" strokeWidth={2} />}
                label="Summary"
                onPress={() => setPanel("summary")}
              />
            ) : null}
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
          <PressScale onPress={pickChapters} style={styles.chapter}>
            <Text style={styles.chapterTime}>
              {d.chapters.length} chapters{d.chapters[0].ai ? " · AI" : ""}
            </Text>
            <Text style={styles.chapterTitle}>See all</Text>
          </PressScale>
          {d.chapters.map((c, i) => (
            <PressScale
              key={`${c.startSec}${i}`}
              onPress={() => video.seek(c.startSec, true)}
              style={[styles.chapter, i === chapter && styles.chapterOn]}
            >
              <Text style={styles.chapterTime}>
                {(clock(c.startSec) || "0:00") + (c.ai ? " · AI" : "")}
              </Text>
              <Text style={styles.chapterTitle} numberOfLines={2}>
                {c.title}
              </Text>
            </PressScale>
          ))}
        </ScrollView>
      ) : null}

      {d ? (
        <DescriptionCard
          detail={d}
          onPress={() => setPanel("description")}
          onSeek={(sec) => video.seek(sec, true)}
        />
      ) : null}

      {focus.comments && d?.comments ? (
        <CommentsCard
          page={comments.data}
          failed={!!comments.error && !comments.data}
          onPress={() => setPanel("comments")}
          onRetry={comments.reload}
        />
      ) : null}

      {queued ? (
        <View style={styles.upNext}>
          <SectionTitle title="Queue" kicker={`${queue.length}`} />
          {queue.map((x) => (
            <View key={x.id} style={styles.queueRow}>
              <View style={{ flex: 1 }}>
                <VideoRow video={asVideo(x)} onPress={() => openWatch(x)} />
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  haptic.light();
                  unqueueWatch(x.id);
                }}
                style={styles.queueRemove}
                accessibilityLabel="Remove from the queue"
              >
                <CloseGlyph
                  size={16}
                  weight={2.6}
                  color="rgba(255,255,255,0.85)"
                />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {inList ? (
        <View style={styles.upNext}>
          <SectionTitle
            title={inList.title}
            kicker={`${listAt + 1} of ${inList.items.length}`}
          />
          {inList.items.slice(listAt + 1, listAt + 41).map((x) => (
            <VideoRow
              key={x.id}
              video={asVideo(x)}
              onPress={() => openWatch(x)}
            />
          ))}
        </View>
      ) : focus.upNext && related.length ? (
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
        failed={!!comments.error && !comments.data}
        onRetry={comments.reload}
        onClose={() => setPanel(null)}
        onSeek={(sec) => video.seek(sec, true)}
      />
    ) : panel === "summary" && src?.stream.captions ? (
      <SummaryPanel
        id={id}
        tracks={src.stream.captions}
        onSeek={(sec) => video.seek(sec, true)}
        onClose={() => setPanel(null)}
      />
    ) : panel === "description" && d ? (
      <DescriptionPanel
        detail={d}
        title={title}
        likes={focus.counts ? likes : undefined}
        onClose={() => setPanel(null)}
        onSeek={(sec) => video.seek(sec, true)}
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
        <FullscreenLayer
          byTurn={byTurn}
          onExit={exitFs}
          onUpright={() => setWatchFullscreen(false)}
        >
          {screen}
        </FullscreenLayer>
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

const DownloadGlyph = ({ done }: { done?: boolean }) =>
  done ? (
    <CircleCheck size={17} color="#fff" strokeWidth={2} />
  ) : (
    <CircleArrowDown size={17} color="#fff" strokeWidth={2} />
  );

const SaveGlyph = () => <ListPlus size={17} color="#fff" strokeWidth={2} />;

const GearGlyph = () => (
  <SlidersHorizontal size={17} color="#fff" strokeWidth={2} />
);

const ShareGlyph = () => <ShareIcon size={17} color="#fff" strokeWidth={2} />;

// Like and dislike in one pill, like YouTube's; counts are hidden in Focus mode.
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

const Thumb = ({ up, on }: { up?: boolean; on?: boolean }) => {
  const Icon = up ? ThumbsUpIcon : ThumbsDownIcon;
  return (
    <Icon size={17} color="#fff" strokeWidth={2} fill={on ? "#fff" : "none"} />
  );
};

// YouTube's own reason, said plainly, like its player does; a generic line when there's none.
// Reasons that won't change by asking again (private, removed, blocked here) are final: no Try again.
function whyNot(e: Error): { why?: string; final?: boolean } {
  if (!(e instanceof StreamError)) return {};
  switch (e.code) {
    case "age_restricted":
      return {
        why: /\bage\b|inappropriate/i.test(e.message)
          ? "This video is age-restricted. Sign in to YouTube to watch it."
          : plainReason(e.message),
        final: true,
      };
    case "unplayable":
      return { why: plainReason(e.message), final: true };
    case "network":
      return {
        why: "Can't reach YouTube. Check your connection and try again.",
      };
    default:
      return {};
  }
}

// The reasons YouTube gives, in plain words; anything else keeps YouTube's own if it's short.
function plainReason(said: string): string {
  if (/\bprivate\b/i.test(said)) return "This video is private.";
  if (/members|join this channel/i.test(said))
    return "This video is only for the channel's members.";
  if (/country|region|location/i.test(said))
    return "This video isn't available in your country.";
  if (/copyright/i.test(said))
    return "This video was blocked on copyright grounds.";
  if (/terminated|removed|no longer available|deleted/i.test(said))
    return "This video has been removed.";
  if (/\b(rent|rental|purchase|buy|premium)\b/i.test(said))
    return "This video has to be rented or bought, which Pawse can't play.";
  if (/live event|premiere|will begin|scheduled/i.test(said)) return said;
  return said.length < 120 && !/^(unplayable|error)$/i.test(said)
    ? said
    : "This video is unavailable.";
}

const asVideo = (s: WatchSeed): VideoItem => ({
  type: "video",
  id: s.id,
  title: s.title ?? "",
  thumbnails: s.thumbnails ?? [],
  channel: s.channel,
});

// When a video ends: replay, go on, or stop here. With autoplay (or a playlist) the next one
// counts down from 5 first, with a cancel, like YouTube.
const COUNTDOWN = 5;
function EndCard({
  next,
  countdown,
  onCancel,
  onReplay,
  onNext,
  onDone,
}: {
  next?: VideoItem;
  countdown?: boolean;
  onCancel: () => void;
  onReplay: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(COUNTDOWN);
  const counting = !!countdown && !!next;
  useEffect(() => {
    if (!counting) return;
    if (left <= 0) {
      onNext();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // onNext opens the next video once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, left]);
  if (counting && next)
    return (
      <Animated.View entering={FadeIn.duration(220)} style={styles.end}>
        <Text style={styles.endKicker}>Up next in {left}</Text>
        <Text style={styles.endTitle} numberOfLines={2}>
          {next.title}
        </Text>
        <View style={styles.endRow}>
          <PressScale onPress={onCancel} style={styles.endBtn}>
            <Text style={styles.endText}>Cancel</Text>
          </PressScale>
          <PressScale onPress={onNext} style={[styles.endBtn, styles.endDone]}>
            <Text style={[styles.endText, { color: "#000" }]}>Play now</Text>
          </PressScale>
        </View>
      </Animated.View>
    );
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
  <Headphones size={17} color="#fff" strokeWidth={2} />
);

// Phones turn the screen for full screen; the web (narrow windows) turns the view instead.
const TURNS_SCREEN = Platform.OS !== "web";

/** What full screen keeps the controls clear of: the notch and home bar, wherever they ended up. */
function useFullscreenPad() {
  const insets = useSafeAreaInsets();
  return TURNS_SCREEN
    ? { left: insets.left, right: insets.right, bottom: insets.bottom }
    : { left: insets.top, right: insets.bottom, bottom: 0 };
}

/** Full screen: the phone turns to landscape (iPhone then hides the status bar), the video fills
 * the black screen, and swiping down leaves, like YouTube. */
function FullscreenLayer({
  children,
  byTurn,
  onExit,
  onUpright,
}: {
  children: React.ReactNode;
  /** Entered by turning the phone: it may turn back upright to leave. */
  byTurn: boolean;
  onExit: () => void;
  onUpright: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const pad = useFullscreenPad();
  const pull = useSharedValue(0);
  // Phones: the outer thirds are for brightness and volume, so only the middle follows the finger down to leave
  // (a fast swipe on a side leaves too, from the controls).
  const mine = useSharedValue(true);
  const exit = useMemo(() => {
    // The web has no brightness or volume swipes, so the whole picture leaves.
    const free = Platform.OS === "web";
    const leave = () => {
      haptic.light();
      onExit();
    };
    return (
      Gesture.Pan()
        .maxPointers(1)
        .activeOffsetY(16)
        .failOffsetX([-30, 30])
        .onBegin((e) => {
          mine.set(free || (e.x > width * SIDE && e.x < width * (1 - SIDE)));
        })
        // The picture follows the finger down and shrinks a little, like YouTube's.
        .onUpdate((e) => {
          if (mine.get()) pull.set(Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          if (!mine.get()) return;
          if (e.translationY > 70 || e.velocityY > LEAVE_V) {
            scheduleOnRN(leave);
            return;
          }
          pull.set(withSpring(0, SETTLE));
        })
    );
  }, [onExit, pull, mine, width]);
  const follow = useAnimatedStyle(() => ({
    transform: [
      { translateY: pull.value * 0.5 },
      { scale: interpolate(pull.value, [0, 300], [1, 0.88], "clamp") },
    ],
  }));
  useEffect(() => {
    if (byTurn) allowRotation();
    else lockLandscape();
    RNStatusBar.setHidden(true, "fade");
    void startLevels();
    const off = byTurn
      ? onTurn((sideways) => !sideways && onUpright())
      : () => {};
    return () => {
      off();
      void stopLevels();
      lockPortrait();
      RNStatusBar.setHidden(false, "fade");
    };
    // Set up once per full screen; onUpright only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTurn]);
  // Until the turn finishes the window is still tall; the turned view covers that moment on the web only.
  const turned = TURNS_SCREEN
    ? { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 }
    : {
        position: "absolute" as const,
        width: height,
        height: width,
        left: (width - height) / 2,
        top: (height - width) / 2,
        // Turned clockwise: the notch ends up on the left, the home bar on the right.
        transform: [{ rotate: "90deg" }],
      };
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.full}>
      <StatusBar hidden />
      <GestureDetector gesture={exit}>
        <View
          style={[
            turned,
            {
              paddingLeft: pad.left,
              paddingRight: pad.right,
              paddingBottom: pad.bottom,
            },
          ]}
        >
          <Animated.View style={[{ flex: 1 }, follow]}>
            {children}
          </Animated.View>
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
  buffering: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
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
  veilText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
    ...display("700"),
  },
  failed: { gap: 14, backgroundColor: "rgba(0,0,0,0.6)" },
  failRow: { flexDirection: "row", gap: 10 },
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  metaText: { flexShrink: 1, color: "rgba(255,255,255,0.6)", fontSize: 12.5 },
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
  queueRow: { flexDirection: "row", alignItems: "center" },
  queueRemove: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
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
  endKicker: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    ...display("700"),
  },
  endTitle: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
    paddingHorizontal: 24,
    ...display("700"),
  },
  endNext: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12.5,
    maxWidth: "80%",
  },
});
