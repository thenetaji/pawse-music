import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { clock } from "../../components/video-card";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";

const RED = "#FF0033";
// Controls fade after this long while the video plays.
const HIDE_MS = 3000;
const SKIP_SEC = 10;
// A second tap this soon after the first, on the same side, is a double tap.
const DOUBLE_MS = 300;
// Double tap skips only in the outer thirds; the middle just shows and hides the controls.
const SIDE = 0.35;

export type ControlsProps = {
  at: number;
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
};

/** Each tap answers at once, like YouTube: it shows or hides the controls, and a quick second
 * tap on a side skips instead, putting the controls back the way they were. */
function tapGesture(o: {
  width: number;
  setShown: (f: (s: boolean) => boolean) => void;
  onTap: () => void;
  onSkip: (side: -1 | 1) => void;
}) {
  const last = { at: 0, side: 0, was: true, skipping: false };
  return Gesture.Tap()
    .runOnJS(true)
    .maxDuration(600)
    .onEnd((e, ok) => {
      if (!ok) return;
      const side =
        e.x < o.width * SIDE ? -1 : e.x > o.width * (1 - SIDE) ? 1 : 0;
      const now = Date.now();
      if (side && side === last.side && now - last.at < DOUBLE_MS) {
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

/** YouTube's player chrome: tap for controls, double-tap a side to skip 10 s, drag the red bar to seek. */
export function VideoControls(p: ControlsProps) {
  const [shown, setShown] = useState(true);
  // Bumped by every touch so the hide timer starts over.
  const [poke, setPoke] = useState(0);
  const [skip, setSkip] = useState<{ side: -1 | 1; n: number }>();
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
    if (!skip) return;
    const t = setTimeout(() => setSkip(undefined), 700);
    return () => clearTimeout(t);
  }, [skip]);

  const touch = () => setPoke((n) => n + 1);
  const act = (fn: () => void) => () => {
    haptic.light();
    touch();
    fn();
  };

  const { onSeek, getTime } = p;
  // Built once per layout, never per frame: a gesture rebuilt while a finger is down drops the tap (iOS, Android).
  const taps = useMemo(
    () =>
      tapGesture({
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
      }),
    [stageW, dur, onSeek, getTime],
  );
  const drag = useMemo(() => {
    const at = (x: number) =>
      barW && dur ? Math.max(0, Math.min(dur, (x / barW) * dur)) : 0;
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => {
        setShown(true);
        setScrub(at(e.x));
      })
      .onUpdate((e) => {
        setShown(true);
        setScrub(at(e.x));
      })
      .onEnd((e) => {
        onSeek(at(e.x));
        haptic.light();
      })
      .onFinalize(() => {
        setScrub(undefined);
        setPoke((n) => n + 1);
      });
  }, [barW, dur, onSeek]);

  const shownAt = scrub ?? p.at;
  const frac = dur ? Math.min(1, shownAt / dur) : 0;
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
      <GestureDetector gesture={taps}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      {skip ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={[styles.skip, skip.side < 0 ? styles.skipL : styles.skipR]}
        >
          <Text style={styles.skipText}>
            {skip.side < 0 ? "«" : "»"} {skip.n * SKIP_SEC} seconds
          </Text>
        </Animated.View>
      ) : null}

      {shown ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(200)}
          style={styles.overlay}
          pointerEvents="box-none"
        >
          <View style={styles.top} pointerEvents="box-none">
            <Btn onPress={act(p.onMinimize)} label="Minimise">
              <Glyph d="M6 9l6 6 6-6" />
            </Btn>
            <View style={{ flex: 1 }} pointerEvents="none" />
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
            <View style={styles.center} pointerEvents="box-none">
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

          <View style={styles.bottom} pointerEvents="box-none">
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
      ) : null}

      {/* Always there as a thin line; with the controls up it grows a handle and takes a drag anywhere along it. */}
      <GestureDetector gesture={drag}>
        <View
          style={styles.barHit}
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
          collapsable={false}
        >
          <View style={[styles.track, shown && styles.trackOn]}>
            <View
              style={[styles.fill, { width: `${frac * 100}%` }]}
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
            <View
              pointerEvents="none"
              style={[
                styles.handle,
                scrub !== undefined && styles.handleBig,
                { left: barW * frac - (scrub !== undefined ? 9 : 6) },
              ]}
            />
          ) : null}
        </View>
      </GestureDetector>
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
  skipText: { color: "#fff", fontSize: 13, ...display("700") },
  // Straddles the video's bottom edge, so a drag can start just under the picture too.
  barHit: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -11,
    height: 22,
    justifyContent: "center",
  },
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
    top: 5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: RED,
  },
  handleBig: { width: 18, height: 18, borderRadius: 9, top: 2 },
});
