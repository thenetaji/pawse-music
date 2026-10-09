import { useEffect, useEffectEvent, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { Cat, type CatColor, type CatMood } from "../cat/cat";
import { Mouse } from "../cat/mouse";

const CAT = 50;
const MOUSE = 34;

type Props = {
  position: number;
  duration: number;
  mood: CatMood;
  cups: [string, string];
  playing: boolean;
  trackId?: string;
  onSeek: (sec: number) => void;
  onLike: () => void;
};

// Gesture and episode bookkeeping lives outside React (one scrubber is on screen at a time).
const shared: {
  lastTick: number;
  purr?: ReturnType<typeof setInterval>;
  lastEp: number;
} = { lastTick: -1, lastEp: 0 };
function newTick(tick: number) {
  if (tick === shared.lastTick) return false;
  shared.lastTick = tick;
  return true;
}
function startPurr() {
  clearInterval(shared.purr);
  shared.purr = setInterval(haptic.soft, 140);
}
const stopPurr = () => clearInterval(shared.purr);
// Never two episodes closer than this, even across songs.
const EPISODE_GAP_MS = 25_000;
function claimEpisode() {
  if (Date.now() - shared.lastEp < EPISODE_GAP_MS) return false;
  shared.lastEp = Date.now();
  return true;
}

/** Seconds between episodes: "Now and then" every 40–75 s, "Often" every 20–40 s. */
const EVERY: Record<"rare" | "often", [number, number]> = {
  rare: [40, 75],
  often: [20, 40],
};
const PLAYING_EPISODES = ["peek", "tease", "cable", "note"] as const;

type Episode = "cable" | "note" | "prank" | "peek" | "tease" | null;

// The progress line is a wire the cat sits on. Drag or tap the wire to seek; tap, double-tap or hold the cat to play.
export function CatScrubber({
  position,
  duration,
  mood,
  cups,
  playing,
  trackId,
  onSeek,
  onLike,
}: Props) {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [react, setReact] = useState<CatMood | null>(null);
  const [episode, setEpisode] = useState<Episode>(null);
  const [epMood, setEpMood] = useState<CatMood | null>(null);
  const [carry, setCarry] = useState<"note" | "cable" | undefined>();
  const [mouseFlip, setMouseFlip] = useState(false);
  const [mouseFrame, setMouseFrame] = useState(0);
  const showCat = useSetting("catWire", true);
  const color = useSetting<CatColor>("catColor", "orange");
  const freq = useSetting<"off" | "rare" | "often">("catEpisodes", "rare");
  const lift = useSharedValue(0);
  const catDX = useSharedValue(0);
  const mouseX = useSharedValue(-100);

  const frac =
    duration > 0 ? Math.min(1, Math.max(0, (drag ?? position) / duration)) : 0;
  const x = frac * width;
  const catLeft = Math.min(
    Math.max(x - CAT / 2, -8),
    Math.max(0, width - CAT + 8),
  );
  const toSec = (px: number) =>
    width > 0 ? Math.min(1, Math.max(0, px / width)) * duration : 0;
  const nearCat = (px: number) =>
    showCat && Math.abs(px - (catLeft + CAT / 2)) < CAT * 0.75;

  const flash = (m: CatMood, ms: number) => {
    setReact(m);
    setTimeout(() => setReact((r) => (r === m ? null : r)), ms);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .hitSlop({ top: 24, bottom: 16 })
    .onStart((e) => {
      lift.set(withSpring(1, { damping: 14, stiffness: 260 }));
      haptic.light();
      setDrag(toSec(e.x));
    })
    .onUpdate((e) => {
      const s = toSec(e.x);
      const tick = Math.floor((s / Math.max(1, duration)) * 20);
      if (newTick(tick)) haptic.tick();
      setDrag(s);
    })
    .onEnd((e) => onSeek(toSec(e.x)))
    .onFinalize(() => {
      lift.set(withSpring(0, { damping: 12, stiffness: 220 }));
      setDrag(null);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .hitSlop({ top: 24, bottom: 16 })
    .onEnd((e) => {
      if (nearCat(e.x)) {
        haptic.light();
        flash("meow", 900);
      } else {
        haptic.tick();
        onSeek(toSec(e.x));
      }
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .hitSlop({ top: 24, bottom: 16 })
    .onEnd((e) => {
      if (!nearCat(e.x)) return;
      haptic.success();
      flash("happy", 1500);
      onLike();
    });

  const hold = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(350)
    .hitSlop({ top: 24, bottom: 16 })
    .onStart((e) => {
      if (!nearCat(e.x)) return;
      setReact("purr");
      startPurr();
    })
    .onFinalize(() => {
      stopPurr();
      setReact((r) => (r === "purr" ? null : r));
    });

  const gesture = Gesture.Race(pan, Gesture.Exclusive(hold, doubleTap, tap));
  // Closing the player mid-hold must not leave the purr haptic running.
  useEffect(() => stopPurr, []);

  // Episodes recur through the song (a prank while paused), spaced so they never run back to back.
  useEffect(() => {
    if (!showCat || freq === "off" || width === 0 || episode) return;
    const [min, max] = EVERY[freq === "often" ? "often" : "rare"];
    const wait = setTimeout(
      () => {
        if (!claimEpisode()) return;
        setEpisode(
          playing
            ? PLAYING_EPISODES[
                Math.floor(Math.random() * PLAYING_EPISODES.length)
              ]
            : "prank",
        );
      },
      (min + Math.random() * (max - min)) * 1000,
    );
    return () => clearTimeout(wait);
  }, [trackId, playing, freq, showCat, width, episode]);

  const catCenter = catLeft + CAT / 2;
  const runEpisode = useEffectEvent((ep: NonNullable<Episode>) => {
    const legs = setInterval(() => setMouseFrame((f) => f + 1), 110);
    const steps: [number, () => void][] = [];
    const t = (ms: number, fn: () => void) => steps.push([ms, fn]);
    // The mouse lives at the far end of the wire from the cat.
    const farRight = catCenter < width / 2;
    if (ep === "peek") {
      // Peeks in at the far end, wiggles while the cat stares, then ducks out.
      const out = farRight ? width + MOUSE : -MOUSE;
      const inX = farRight ? width - MOUSE * 0.7 : -MOUSE * 0.3;
      t(0, () => setMouseFlip(farRight));
      mouseX.set(out);
      mouseX.set(
        withSequence(
          withTiming(inX, { duration: 420, easing: Easing.out(Easing.quad) }),
          withTiming(inX + (farRight ? -6 : 6), { duration: 500 }),
          withTiming(inX, { duration: 500 }),
          withTiming(out, { duration: 380, easing: Easing.in(Easing.quad) }),
        ),
      );
      t(350, () => setEpMood("curious"));
      t(1400, () => haptic.tick());
      t(1900, () => setEpMood("meow"));
      t(2600, () => setEpisode(null));
    } else if (ep === "tease") {
      // Runs halfway in, the cat lunges, the mouse bolts home and the cat sulks.
      const out = farRight ? width + MOUSE : -MOUSE;
      const stop = (catCenter + (farRight ? width : 0)) / 2 - MOUSE / 2;
      t(0, () => setMouseFlip(farRight));
      mouseX.set(out);
      mouseX.set(
        withSequence(
          withTiming(stop, { duration: 900, easing: Easing.out(Easing.quad) }),
          withTiming(stop, { duration: 700 }),
          withTiming(out, { duration: 650, easing: Easing.in(Easing.quad) }),
        ),
      );
      t(400, () => setEpMood("curious"));
      t(1500, () => {
        setEpMood("chase");
        haptic.light();
        catDX.set(
          withSequence(
            withTiming(farRight ? 60 : -60, { duration: 450 }),
            withTiming(0, { duration: 900 }),
          ),
        );
      });
      t(1600, () => setMouseFlip(!farRight));
      t(2500, () => setEpMood("meow"));
      t(3300, () => setEpisode(null));
    } else if (ep === "prank") {
      t(0, () => setMouseFlip(false));
      mouseX.set(-MOUSE);
      mouseX.set(
        withTiming(width + MOUSE, { duration: 5200, easing: Easing.linear }),
      );
      t(0, () => setEpMood("sleep"));
      t(2300, () => setEpMood("curious"));
      t(3200, () => setEpMood("sleep"));
      t(5400, () => setEpisode(null));
    } else {
      const fromRight = ep === "cable";
      const grab = fromRight ? catCenter + 18 : catCenter - 18 - MOUSE;
      t(0, () => setMouseFlip(fromRight));
      mouseX.set(fromRight ? width + MOUSE : -MOUSE);
      mouseX.set(
        withSequence(
          withTiming(grab, { duration: 1500, easing: Easing.out(Easing.quad) }),
          withTiming(grab, { duration: 500 }),
          withTiming(fromRight ? width + MOUSE * 2 : -MOUSE * 2, {
            duration: 1300,
            easing: Easing.in(Easing.quad),
          }),
        ),
      );
      t(0, () => setEpMood("curious"));
      t(1500, () => {
        setMouseFlip(!fromRight);
        setCarry(ep);
        setEpMood("meow");
        haptic.light();
      });
      t(2000, () => {
        setEpMood("chase");
        catDX.set(
          withSequence(
            withTiming(fromRight ? 70 : -70, { duration: 900 }),
            withTiming(0, { duration: 1200 }),
          ),
        );
      });
      t(4200, () => {
        setCarry(undefined);
        setEpMood("meow");
      });
      t(5000, () => setEpisode(null));
    }
    const timers = steps.map(([ms, fn]) => setTimeout(fn, ms));
    return () => {
      clearInterval(legs);
      timers.forEach(clearTimeout);
      setEpMood(null);
      setCarry(undefined);
      catDX.set(0);
      mouseX.set(-100);
    };
  });
  useEffect(() => (episode ? runEpisode(episode) : undefined), [episode]);

  const catStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: catDX.value },
      { translateY: -lift.value * 10 },
      { scale: 1 + lift.value * 0.18 },
    ],
  }));
  const mouseStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: mouseX.value }],
  }));

  const shownMood: CatMood =
    drag !== null ? "curious" : (epMood ?? react ?? mood);

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hit}
          onLayout={(e: LayoutChangeEvent) =>
            setWidth(e.nativeEvent.layout.width)
          }
        >
          <View style={styles.wire}>
            <View style={[styles.played, { width: x }]} />
          </View>
          {showCat ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.cat, { left: catLeft }, catStyle]}
            >
              <Cat
                mood={shownMood}
                size={CAT}
                cups={cups}
                color={color}
                look={
                  episode && episode !== "prank"
                    ? episode === "cable"
                      ? 1
                      : -1
                    : undefined
                }
              />
            </Animated.View>
          ) : (
            <View pointerEvents="none" style={[styles.knob, { left: x - 7 }]} />
          )}
          {episode ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.mouse, mouseStyle]}
            >
              <Mouse
                size={MOUSE}
                frame={mouseFrame}
                flip={mouseFlip}
                carrying={carry}
              />
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={[styles.time, drag !== null && styles.timeLive]}>
          {fmt(drag ?? position)}
        </Text>
        <Text style={styles.time}>
          -{fmt(Math.max(0, duration - (drag ?? position)))}
        </Text>
      </View>
    </View>
  );
}

function fmt(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  hit: { height: 58, justifyContent: "flex-end", paddingBottom: 6 },
  wire: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  played: { height: 4, backgroundColor: "rgba(255,255,255,0.85)" },
  cat: { position: "absolute", bottom: 1, width: CAT, height: CAT },
  knob: {
    position: "absolute",
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
  },
  mouse: {
    position: "absolute",
    bottom: 3,
    left: 0,
    width: MOUSE,
    height: MOUSE,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  time: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  timeLive: { color: "#fff" },
});
