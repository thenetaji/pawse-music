import LottieView from "lottie-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import dance from "../../../../assets/cats/dance.json";
import sleep from "../../../../assets/cats/sleep.json";
import { tempoSpeed } from "../beat";
import { beatFeed, useBeatFeed } from "../beat-feed";
import { useCatCalm, useCatVisible } from "../use-cat-motion";
import { type Leg, nextLeg, nextMirror, STOPS } from "./dance-moves";
import { advanceBeat, snapToBeat, sway } from "./dance-sway";

// The dance cat's feet end above the bottom of its picture; this puts them back on the wire.
const FEET = 0.12;
const FADE_MS = 400;
const CALM_FADE_MS = 250;
const INTRO_MS = 450;
const TURN_MS = 260;
// How much the cat that is fading out shrinks, and the one fading in grows from.
const SETTLE = 0.06;
const HOP = 0.04;
const TILT_DEG = 3;
const KICK_PULL = 0.35;
const MAX_FRAME_MS = 100;

// Dances while music plays and sleeps when it's paused. Both stay loaded and trade places with a crossfade, so there is never an empty frame.
export function LottieCat({
  size,
  playing,
}: {
  size: number;
  playing: boolean;
}) {
  const visible = useCatVisible();
  const calm = useCatCalm();
  const run = visible && !calm;
  const mix = useSharedValue(playing ? 1 : 0);
  const intro = useSharedValue(0);
  const settle = calm ? 0 : SETTLE;

  useEffect(() => {
    intro.set(withTiming(1, { duration: calm ? CALM_FADE_MS : INTRO_MS }));
  }, [calm, intro]);

  useEffect(() => {
    mix.set(
      withTiming(playing ? 1 : 0, {
        duration: calm ? CALM_FADE_MS : FADE_MS,
        easing: Easing.inOut(Easing.quad),
      }),
    );
  }, [playing, calm, mix]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: intro.get() }));
  const box = { width: size, height: size };

  // Rebuilt when Reduce motion changes, so each starts from its first frame.
  return (
    <Animated.View style={[box, rootStyle]}>
      <Sleeper
        key={calm ? "still" : "live"}
        size={size}
        run={run && !playing}
        mix={mix}
        settle={settle}
      />
      <Dancer
        key={calm ? "still" : "live"}
        size={size}
        run={run && playing}
        still={calm}
        mix={mix}
        settle={settle}
      />
    </Animated.View>
  );
}

type LayerProps = {
  size: number;
  run: boolean;
  mix: SharedValue<number>;
  settle: number;
};

function Sleeper({ size, run, mix, settle }: LayerProps) {
  const ref = useRef<LottieView>(null);

  // Keeps breathing while it fades out, then stops.
  useEffect(() => {
    if (run) {
      ref.current?.play();
      return;
    }
    const id = setTimeout(() => ref.current?.pause(), FADE_MS);
    return () => clearTimeout(id);
  }, [run]);

  // The cat underneath stays solid until the one on top is half there, so nothing shows through in between.
  const style = useAnimatedStyle(() => {
    const m = mix.get();
    return {
      opacity: interpolate(m, [0, 0.5, 1], [1, 1, 0]),
      transform: [{ scale: 1 - settle * m }],
    };
  });

  return (
    <Animated.View style={[styles.layer, style]}>
      <LottieView
        ref={ref}
        source={sleep}
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </Animated.View>
  );
}

type Playing = { from: number; to: number; speed: number };

function Dancer({
  size,
  run,
  still,
  mix,
  settle,
}: LayerProps & { still: boolean }) {
  const ref = useRef<LottieView>(null);
  const [loaded, setLoaded] = useState(false);
  const [turn, setTurn] = useState(0);
  const [leg, setLeg] = useState<Playing>();
  const rest = useRef(STOPS[0]);
  const last = useRef<Leg>(undefined);
  const active = useRef<Leg>(undefined);
  const mirrored = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  const facing = useSharedValue(1);
  const count = useSharedValue(0);
  const seenKick = useSharedValue(0);
  const lift = useSharedValue(0);
  const tilt = useSharedValue(0);

  useBeatFeed(run);

  // Each move ends on a stop and the next is chosen there. Pausing or leaving the screen lets the move finish, so the cat always comes to rest on a held pose.
  useEffect(() => {
    if (!run || !loaded || active.current) return;
    const move = nextLeg(rest.current, last.current, Math.random);
    const mirror = last.current
      ? nextMirror(rest.current, mirrored.current, Math.random)
      : false;
    const turned = mirror !== mirrored.current;
    last.current = move;
    active.current = move;
    mirrored.current = mirror;
    const start = () =>
      setLeg({
        from: move.from,
        to: move.to,
        speed: tempoSpeed(beatFeed.beatMs.get()),
      });
    if (!turned) {
      start();
      return;
    }
    facing.set(
      withTiming(mirror ? -1 : 1, {
        duration: TURN_MS,
        easing: Easing.inOut(Easing.quad),
      }),
    );
    pending.current = setTimeout(start, TURN_MS);
  }, [run, loaded, turn, facing]);
  useEffect(() => () => clearTimeout(pending.current), []);

  useEffect(() => {
    if (leg) ref.current?.play(leg.from, leg.to);
  }, [leg]);

  const beat = useFrameCallback((frame) => {
    const dt = Math.min(MAX_FRAME_MS, frame.timeSincePreviousFrame ?? 16);
    let next = advanceBeat(count.get(), dt, beatFeed.beatMs.get());
    const kick = beatFeed.onsetAt.get();
    if (kick !== seenKick.get()) {
      seenKick.set(kick);
      if (beatFeed.locked.get()) next = snapToBeat(next, KICK_PULL);
    }
    count.set(next);
    const motion = sway(next, beatFeed.amp.get());
    lift.set(motion.lift);
    tilt.set(motion.tilt);
  }, false);
  useEffect(() => {
    beat.setActive(run);
    if (!run) {
      lift.set(withTiming(0, { duration: FADE_MS }));
      tilt.set(withTiming(0, { duration: FADE_MS }));
    }
  }, [run, beat, lift, tilt]);

  const style = useAnimatedStyle(() => {
    const m = mix.get();
    const scale = 1 - settle * (1 - m);
    return {
      opacity: m,
      transform: [
        { translateY: size * FEET - lift.get() * size * HOP },
        { rotate: `${tilt.get() * TILT_DEG}deg` },
        { scaleX: facing.get() * scale },
        { scaleY: scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.layer, style]}>
      <LottieView
        ref={ref}
        source={dance}
        loop={false}
        speed={still ? 0 : (leg?.speed ?? 0)}
        resizeMode="contain"
        style={{ width: size, height: size }}
        onAnimationLoaded={() => setLoaded(true)}
        onAnimationFinish={(cancelled) => {
          if (cancelled || !active.current) return;
          rest.current = active.current.to;
          active.current = undefined;
          setTurn((t) => t + 1);
        }}
      />
    </Animated.View>
  );
}

// Both cats stand on the bottom edge, so scaling and leaning pivot there.
const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    transformOrigin: "50% 100%",
  },
});
