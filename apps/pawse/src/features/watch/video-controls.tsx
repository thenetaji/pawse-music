import type { CaptionCue } from "@pawse/music-core";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { clock } from "../../components/video-card";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { CaptionOverlay } from "./captions";

const RED = "#FF0033";
// Controls fade after this long while the video plays.
const HIDE_MS = 3000;
const SKIP_SEC = 10;
// A second tap this soon after the first, on the same side, is a double tap.
const DOUBLE_MS = 300;
// Double tap skips only in the outer thirds; the middle just shows and hides the controls.
const SIDE = 0.35;
// Fingers lifting just after a pinch aren't a tap.
const PINCH_GRACE_MS = 400;
const SKIP_KEEP_MS = 1000;
// Press and hold the picture this long to play at 2x, like YouTube.
const HOLD_MS = 450;

/** The playing position, outside React state: only what shows the time re-renders as it moves. */
export type Clock = {
  get: () => number;
  set: (sec: number) => void;
  subscribe: (l: () => void) => () => void;
};
export function makeClock(): Clock {
  let at = 0;
  const ls = new Set<() => void>();
  return {
    get: () => at,
    set: (sec) => {
      if (sec === at) return;
      at = sec;
      for (const l of ls) l();
    },
    subscribe: (l) => {
      ls.add(l);
      return () => void ls.delete(l);
    },
  };
}
export const useClock = (c: Clock) =>
  useSyncExternalStore(c.subscribe, c.get, c.get);

export type ControlsProps = {
  clock: Clock;
  /** The playing position right now; gestures read it so they needn't be rebuilt as time passes. */
  getTime: () => number;
  /** In our full-screen view: the button exits it. */
  fullscreen?: boolean;
  dur?: number;
  playing: boolean;
  chapters: { startSec: number; title: string }[];
  canPrev: boolean;
  canNext: boolean;
  autoplay: boolean;
  onToggle: () => void;
  onSeek: (sec: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onMinimize: () => void;
  onSettings: () => void;
  onFullscreen: () => void;
  onAutoplay: (on: boolean) => void;
  /** Captions: undefined when the video has none; the cues to show while they're on. */
  cc?: boolean;
  cues?: CaptionCue[];
  onCc?: () => void;
  /** Full screen shows what's playing at the top, like YouTube. */
  title?: string;
  channel?: string;
  /** Full screen only: pinch out fills the screen, pinch in fits the whole picture. Must be stable. */
  onZoom?: (fill: boolean) => void;
  /** Press and hold: true plays at 2x until the finger lifts. Must be stable. */
  onHold?: (on: boolean) => void;
};

/** Each tap answers at once, like YouTube: it shows or hides the controls, and a quick second
 * tap on a side skips instead, putting the controls back the way they were. */
function tapGesture(o: {
  width: number;
  setShown: (f: (s: boolean) => boolean) => void;
  onTap: () => void;
  onSkip: (side: -1 | 1) => void;
  /** A pinch or a hold is under way or just ended: its fingers aren't taps. */
  pinching: () => boolean;
}) {
  const last = { at: 0, side: 0, was: true, skipping: false };
  return Gesture.Tap()
    .runOnJS(true)
    .maxDistance(20)
    .maxDuration(HOLD_MS + 150)
    .onEnd((e, ok) => {
      if (!ok || o.pinching()) return;
      const side =
        e.x < o.width * SIDE ? -1 : e.x > o.width * (1 - SIDE) ? 1 : 0;
      const now = Date.now();
      // Once skipping, each tap on that side within a second adds 10 s more, like YouTube.
      const gap = last.skipping ? SKIP_KEEP_MS : DOUBLE_MS;
      if (side && side === last.side && now - last.at < gap) {
        const was = last.was;
        if (!last.skipping) o.setShown(() => was);
        last.at = now;
        last.skipping = true;
        o.onSkip(side);
        return;
      }
      last.at = now;
      last.side = side;
      last.skipping = false;
      o.setShown((s) => {
        last.was = s;
        return !s;
      });
      o.onTap();
    });
}

/** Taps, and in full screen a pinch beside them; the tap ignores fingers that were pinching. */
function stageGesture(
  o: Omit<Parameters<typeof tapGesture>[0], "pinching"> & {
    onZoom?: (fill: boolean) => void;
    onHold?: (on: boolean) => void;
  },
) {
  const pinch = { at: 0, on: false };
  const held = { at: 0, on: false };
  const taps = tapGesture({
    ...o,
    pinching: () =>
      pinch.on ||
      held.on ||
      Date.now() - pinch.at < PINCH_GRACE_MS ||
      Date.now() - held.at < PINCH_GRACE_MS,
  });
  const { onZoom, onHold } = o;
  const hold = onHold
    ? Gesture.LongPress()
        .runOnJS(true)
        .minDuration(HOLD_MS)
        .maxDistance(30)
        .onStart(() => {
          held.on = true;
          haptic.light();
          onHold(true);
        })
        .onFinalize(() => {
          if (!held.on) return;
          held.on = false;
          held.at = Date.now();
          onHold(false);
        })
    : undefined;
  const touch = hold ? Gesture.Simultaneous(hold, taps) : taps;
  if (!onZoom) return touch;
  const zoom = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      pinch.on = true;
    })
    .onEnd((e) => {
      if (e.scale > 1.08) onZoom(true);
      else if (e.scale < 0.92) onZoom(false);
    })
    .onFinalize(() => {
      pinch.on = false;
      pinch.at = Date.now();
    });
  return Gesture.Simultaneous(zoom, touch);
}

/** YouTube's player chrome: tap for controls, double-tap a side to skip 10 s, drag the red bar to seek. */
export function VideoControls(p: ControlsProps) {
  const at = useClock(p.clock);
  const [shown, setShown] = useState(true);
  // Bumped by every touch so the hide timer starts over.
  const [poke, setPoke] = useState(0);
  const [skip, setSkip] = useState<{ side: -1 | 1; n: number }>();
  const [zoomNote, setZoomNote] = useState<string>();
  const [fast, setFast] = useState(false);
  const [scrub, setScrub] = useState<number>();
  const [barW, setBarW] = useState(0);
  const [stageW, setStageW] = useState(0);
  const dur = p.dur ?? 0;

  useEffect(() => {
    if (!shown || !p.playing || scrub !== undefined) return;
    const t = setTimeout(() => setShown(false), HIDE_MS);
    return () => clearTimeout(t);
  }, [shown, p.playing, poke, scrub]);
  useEffect(() => {
    if (!zoomNote) return;
    const t = setTimeout(() => setZoomNote(undefined), 900);
    return () => clearTimeout(t);
  }, [zoomNote]);
  useEffect(() => {
    if (!skip) return;
    const t = setTimeout(() => setSkip(undefined), SKIP_KEEP_MS);
    return () => clearTimeout(t);
  }, [skip]);

  // The chrome stays mounted and fades on the UI thread, so a tap never waits on a re-layout.
  const vis = useSharedValue(1);
  useEffect(() => {
    vis.set(withTiming(shown ? 1 : 0, { duration: shown ? 140 : 220 }));
  }, [shown, vis]);
  const fade = useAnimatedStyle(() => ({ opacity: vis.value }));
  // Every row, not just the overlay: on the web a box-none row lets its buttons take touches again.
  const live = shown ? "box-none" : "none";

  // The red bar moves on the UI thread: it glides between time updates and follows a scrub frame by frame.
  const played = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const scrubAt = useSharedValue(0);
  const scrubSec = useSharedValue(-1);
  const big = useSharedValue(0);
  const { playing } = p;
  useEffect(() => {
    const f = dur ? Math.min(1, at / dur) : 0;
    const step = (f - played.get()) * dur;
    played.set(
      playing && step > 0 && step < 1.5
        ? withTiming(f, { duration: 500, easing: Easing.linear })
        : f,
    );
  }, [at, dur, playing, played]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(scrubbing.value ? scrubAt.value : played.value) * 100}%`,
  }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: (scrubbing.value ? scrubAt.value : played.value) * barW - 9,
      },
      { scale: 0.67 + big.value * 0.33 },
    ],
  }));

  const touch = () => setPoke((n) => n + 1);
  const act = (fn: () => void) => () => {
    haptic.light();
    touch();
    fn();
  };

  const { onSeek, getTime } = p;
  // Built once per layout, never per frame: a gesture rebuilt while a finger is down drops the tap (iOS, Android).
  // Two fingers are a pinch, never taps: pinching used to read as a double tap and skip.
  const { onZoom, fullscreen, onHold } = p;
  const stage = useMemo(
    () =>
      stageGesture({
        width: stageW,
        setShown,
        onTap: () => setPoke((n) => n + 1),
        onSkip: (side) => {
          haptic.light();
          onSeek(
            Math.max(0, Math.min(dur || Infinity, getTime() + side * SKIP_SEC)),
          );
          setSkip((s) => ({ side, n: s?.side === side ? s.n + 1 : 1 }));
        },
        onZoom:
          fullscreen && onZoom
            ? (fill) => {
                onZoom(fill);
                setZoomNote(fill ? "Zoomed to fill" : "Original");
              }
            : undefined,
        onHold: onHold
          ? (on) => {
              setFast(on);
              if (on) setShown(false);
              onHold(on);
            }
          : undefined,
      }),
    [stageW, dur, onSeek, getTime, fullscreen, onZoom, onHold],
  );
  // A tick under the finger at each chapter start, like YouTube's scrubber.
  const marks = useMemo(
    () => p.chapters.map((c) => c.startSec).filter((s) => s > 0),
    [p.chapters],
  );
  const drag = useMemo(() => {
    const scrubTo = (sec: number) => {
      setShown(true);
      setScrub((was) => {
        if (was !== undefined && marks.some((m) => was < m !== sec < m))
          haptic.tick();
        return sec;
      });
    };
    const seekTo = (sec: number) => {
      onSeek(sec);
      haptic.light();
    };
    const done = () => {
      setScrub(undefined);
      setPoke((n) => n + 1);
    };
    const frac = (x: number) => {
      "worklet";
      return barW > 0 ? Math.max(0, Math.min(1, x / barW)) : 0;
    };
    const follow = (x: number) => {
      "worklet";
      const f = frac(x);
      scrubAt.set(f);
      const sec = Math.floor(f * dur);
      if (sec === scrubSec.get()) return;
      scrubSec.set(sec);
      scheduleOnRN(scrubTo, sec);
    };
    return Gesture.Pan()
      .maxPointers(1)
      .minDistance(0)
      .onBegin((e) => {
        scrubbing.set(true);
        big.set(withTiming(1, { duration: 120 }));
        scrubSec.set(-1);
        follow(e.x);
      })
      .onUpdate((e) => follow(e.x))
      .onEnd((e, ok) => {
        // A drag the system took over (a swipe home, a scroll) doesn't move the video.
        if (!ok) return;
        played.set(frac(e.x));
        scheduleOnRN(seekTo, frac(e.x) * dur);
      })
      .onFinalize(() => {
        scrubbing.set(false);
        big.set(withTiming(0, { duration: 160 }));
        scheduleOnRN(done);
      });
  }, [barW, dur, onSeek, marks, scrubAt, scrubSec, scrubbing, big, played]);

  const shownAt = scrub ?? at;
  const chapter = p.chapters.reduce<string | undefined>(
    (cur, c) => (c.startSec <= shownAt ? c.title : cur),
    undefined,
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        setStageW(e.nativeEvent.layout.width);
      }}
    >
      <GestureDetector gesture={stage}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      {p.cues?.length ? (
        <CaptionOverlay
          cues={p.cues}
          time={getTime}
          raised={shown}
          large={!!p.fullscreen}
        />
      ) : null}

      {zoomNote ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={styles.zoomWrap}
        >
          <Text style={styles.zoomNote}>{zoomNote}</Text>
        </Animated.View>
      ) : null}

      {fast ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(160)}
          pointerEvents="none"
          style={[styles.fast, p.fullscreen && styles.fastFull]}
        >
          <Text style={styles.fastText}>2× ▸▸</Text>
        </Animated.View>
      ) : null}

      {skip ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={[styles.skip, skip.side < 0 ? styles.skipL : styles.skipR]}
        >
          <Text style={styles.skipText}>
            {skip.side < 0 ? "◂◂◂" : "▸▸▸"}
            {"\n"}
            {skip.n * SKIP_SEC} seconds
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View
        style={[styles.overlay, fade]}
        pointerEvents={live}
      >
        <View
          style={[styles.top, p.fullscreen && styles.topFull]}
          pointerEvents={live}
        >
          <Btn
            onPress={act(p.onMinimize)}
            label={p.fullscreen ? "Exit full screen" : "Minimise"}
          >
            <Glyph d="M6 9l6 6 6-6" />
          </Btn>
          <View style={{ flex: 1 }} pointerEvents="none">
            {p.title ? (
              <>
                <Text style={styles.headTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                {p.channel ? (
                  <Text style={styles.headSub} numberOfLines={1}>
                    {p.channel}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
          {p.cc !== undefined && p.onCc ? (
            <Btn
              onPress={act(p.onCc)}
              label={p.cc ? "Turn captions off" : "Turn captions on"}
            >
              <View style={styles.ccBox}>
                <Text style={styles.ccText}>CC</Text>
                {p.cc ? <View style={styles.ccOn} /> : null}
              </View>
            </Btn>
          ) : null}
          <View style={styles.auto}>
            <Switch
              value={p.autoplay}
              onValueChange={(v) => {
                touch();
                p.onAutoplay(v);
              }}
              trackColor={{ true: "#fff", false: "rgba(255,255,255,0.3)" }}
              thumbColor={p.autoplay ? "#000" : "#fff"}
              style={styles.switch}
              accessibilityLabel="Autoplay"
            />
          </View>
          <Btn onPress={act(p.onSettings)} label="Settings">
            <GearGlyph />
          </Btn>
        </View>

        {scrub === undefined ? (
          <View style={styles.center} pointerEvents={live}>
            <Btn
              onPress={act(p.onPrev)}
              label="Previous"
              disabled={!p.canPrev}
              round
            >
              <PrevGlyph />
            </Btn>
            <Btn
              onPress={act(p.onToggle)}
              label={p.playing ? "Pause" : "Play"}
              round
              big
            >
              {p.playing ? <PauseGlyph /> : <PlayGlyph />}
            </Btn>
            <Btn
              onPress={act(p.onNext)}
              label="Next"
              disabled={!p.canNext}
              round
            >
              <NextGlyph />
            </Btn>
          </View>
        ) : (
          <View style={styles.center} pointerEvents="none">
            <View style={styles.bubble}>
              <Text style={styles.bubbleTime}>{clock(scrub) || "0:00"}</Text>
              {chapter ? (
                <Text style={styles.bubbleChapter} numberOfLines={1}>
                  {chapter}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        <View
          style={[styles.bottom, p.fullscreen && styles.bottomFull]}
          pointerEvents={live}
        >
          <View style={styles.time}>
            <Text style={styles.timeText}>
              {clock(shownAt) || "0:00"}
              {dur ? ` / ${clock(dur)}` : ""}
            </Text>
          </View>
          <View style={{ flex: 1 }} pointerEvents="none" />
          <Btn
            onPress={act(p.onFullscreen)}
            label={p.fullscreen ? "Exit full screen" : "Full screen"}
          >
            <Glyph
              d={
                p.fullscreen
                  ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                  : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
              }
            />
          </Btn>
        </View>
      </Animated.View>

      {/* A thin line under the video (gone in full screen until the controls are up); with the controls
          up it grows a handle and takes a drag anywhere along it. */}
      {shown || !p.fullscreen ? (
        <GestureDetector gesture={drag}>
          <View
            style={[styles.barHit, p.fullscreen && styles.barHitFull]}
            onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
            collapsable={false}
          >
            <View style={[styles.track, shown && styles.trackOn]}>
              <Animated.View
                style={[styles.fill, fillStyle]}
                pointerEvents="none"
              />
              {shown && dur
                ? p.chapters
                    .filter((c) => c.startSec > 0)
                    .map((c) => (
                      <View
                        key={c.startSec}
                        style={[
                          styles.tick,
                          { left: `${(c.startSec / dur) * 100}%` },
                        ]}
                      />
                    ))
                : null}
            </View>
            {shown ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.handle,
                  // Centred on the line, whatever the bar's height.
                  { top: (p.fullscreen ? 20 : 11) - 9 },
                  handleStyle,
                ]}
              />
            ) : null}
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

function Btn({
  children,
  onPress,
  label,
  disabled,
  round,
  big,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  round?: boolean;
  big?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={label}
      style={[
        styles.btn,
        round && styles.round,
        big && styles.big,
        disabled && { opacity: 0.35 },
      ]}
    >
      {children}
    </Pressable>
  );
}

const Glyph = ({ d }: { d: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path
      d={d}
      stroke="#fff"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const PlayGlyph = () => (
  <Svg width={34} height={34} viewBox="0 0 24 24">
    <Path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"
      fill="#fff"
    />
  </Svg>
);
const PauseGlyph = () => (
  <Svg width={32} height={32} viewBox="0 0 24 24">
    <Path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" fill="#fff" />
  </Svg>
);
const PrevGlyph = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Path
      d="M6 5h2.4v14H6zM19 5.8v12.4a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l8.15-6.2A.8.8 0 0 1 19 5.8z"
      fill="#fff"
    />
  </Svg>
);
const NextGlyph = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24">
    <Path
      d="M18 5h-2.4v14H18zM5 5.8v12.4a.8.8 0 0 0 1.25.66l8.15-6.2a.8.8 0 0 0 0-1.32l-8.15-6.2A.8.8 0 0 0 5 5.8z"
      fill="#fff"
    />
  </Svg>
);
const GearGlyph = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  auto: { paddingHorizontal: 4 },
  ccBox: {
    minWidth: 26,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.6,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  ccText: { color: "#fff", fontSize: 10.5, ...display("800") },
  // YouTube's red line under CC while captions are on.
  ccOn: {
    position: "absolute",
    left: 2,
    right: 2,
    bottom: -6,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: RED,
  },
  headTitle: { color: "#fff", fontSize: 16, ...display("700") },
  headSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 1 },
  switch: { transform: [{ scale: 0.8 }] },
  // Rows stacked, never overlapping, so each button gets its own touches on every platform.
  center: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 34,
  },
  bottom: {
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  big: { width: 64, height: 64, borderRadius: 32 },
  time: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  timeText: {
    color: "#fff",
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
    ...display("700"),
  },
  bubble: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    maxWidth: "70%",
  },
  bubbleTime: {
    color: "#fff",
    fontSize: 18,
    fontVariant: ["tabular-nums"],
    ...display("800"),
  },
  bubbleChapter: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12.5,
    marginTop: 2,
  },
  skip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "38%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  skipL: { left: 0, borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  skipR: { right: 0, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  skipText: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    ...display("700"),
  },
  zoomWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomNote: {
    color: "#fff",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.6)",
    ...display("700"),
  },
  // Straddles the video's bottom edge, so a drag can start just under the picture too.
  barHit: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -11,
    height: 22,
    justifyContent: "center",
  },
  // Full screen, like YouTube: the bar sits above the bottom edge with room to grab it, the time
  // and buttons above it.
  barHitFull: { left: 16, right: 16, bottom: 10, height: 40 },
  bottomFull: { paddingBottom: 46, paddingHorizontal: 14 },
  topFull: { paddingTop: 12, paddingHorizontal: 10 },
  track: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  trackOn: { height: 3 },
  fill: { height: "100%", backgroundColor: RED },
  tick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  handle: {
    position: "absolute",
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: RED,
  },
  fast: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  fastFull: { top: 24 },
  fastText: { color: "#fff", fontSize: 13.5, ...display("700") },
});
