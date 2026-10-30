import type LottieView from "lottie-react-native";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import sleep from "../../../../assets/cats/sleep.json";
import { Lottie } from "../../../components/lottie";
import { useCatCalm, useCatVisible } from "../use-cat-motion";
import { DANCES, nextDance } from "./dances";

const FADE_MS = 400;
const CALM_FADE_MS = 250;
const INTRO_MS = 450;
// How much the cat that is fading out shrinks, and the one fading in grows from.
const SETTLE = 0.06;

// Dances while music plays and sleeps when it's paused. Both stay loaded and trade places with a crossfade, so there is never an empty frame.
export function LottieCat({
  size,
  playing,
  track,
}: {
  size: number;
  playing: boolean;
  track?: string;
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
        mix={mix}
        settle={settle}
        track={track}
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
      <Lottie ref={ref} source={sleep} size={size} />
    </Animated.View>
  );
}

// One pick per song, kept outside the components so the Home cat and the Now playing cat agree, and reopening Now playing keeps the dance.
const picks = new Map<string, number>();
let last = 0;

function danceFor(track: string | undefined): number {
  if (!track) return last;
  let d = picks.get(track);
  if (d === undefined) {
    d = picks.size ? nextDance(last) : 0;
    if (picks.size > 200) picks.clear();
    picks.set(track, d);
  }
  last = d;
  return d;
}

// Each song gets a different dance, crossfaded in. Every one plays as its artist made it, looping.
function Dancer({
  size,
  run,
  mix,
  settle,
  track,
}: LayerProps & { track?: string }) {
  const ref = useRef<LottieView>(null);
  const index = useMemo(() => danceFor(track), [track]);
  const dance = DANCES[index];

  useEffect(() => {
    if (run) {
      ref.current?.resume();
      return;
    }
    const id = setTimeout(() => ref.current?.pause(), FADE_MS);
    return () => clearTimeout(id);
  }, [run]);

  const style = useAnimatedStyle(() => {
    const m = mix.get();
    const scale = 1 - settle * (1 - m);
    return { opacity: m, transform: [{ scale }] };
  });

  return (
    <Animated.View style={[styles.layer, style]}>
      <Animated.View
        key={dance.id}
        entering={FadeIn.duration(FADE_MS)}
        exiting={FadeOut.duration(FADE_MS)}
        style={[
          styles.layer,
          {
            transform: [
              { translateY: size * dance.lift },
              { scale: dance.scale ?? 1 },
            ],
          },
        ]}
      >
        <Lottie ref={ref} source={dance.load()} size={size} autoPlay={run} />
      </Animated.View>
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
