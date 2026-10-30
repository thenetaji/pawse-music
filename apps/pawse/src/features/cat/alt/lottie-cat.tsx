import LottieView from "lottie-react-native";
import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import dance from "../../../../assets/cats/dance.json";
import sleep from "../../../../assets/cats/sleep.json";
import { useCatCalm, useCatVisible } from "../use-cat-motion";

// The dance cat's feet end above the bottom of its picture; this puts them back on the wire.
const FEET = 0.12;
const FADE_MS = 400;
const CALM_FADE_MS = 250;
const INTRO_MS = 450;
// How much the cat that is fading out shrinks, and the one fading in grows from.
const SETTLE = 0.06;

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

// Plays the animation as its artist made it, looping; it keeps moving while it fades out, then stops.
function Dancer({ size, run, mix, settle }: LayerProps) {
  const ref = useRef<LottieView>(null);

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
    return {
      opacity: m,
      transform: [{ translateY: size * FEET }, { scale }],
    };
  });

  return (
    <Animated.View style={[styles.layer, style]}>
      <LottieView
        ref={ref}
        source={dance}
        autoPlay={run}
        loop
        resizeMode="contain"
        style={{ width: size, height: size }}
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
