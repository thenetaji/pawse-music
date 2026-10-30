import { type ReactNode, useEffect, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const FADE_MS = 700;

export type TintPair = {
  a: string;
  b: string;
  front: 0 | 1;
  mix: SharedValue<number>;
};

/**
 * Holds the old tint under the new one and fades the new one in on the UI thread,
 * so a song's colours settle in smoothly instead of snapping when its palette lands.
 */
export function useTintPair(color: string): TintPair {
  const [pair, setPair] = useState<Omit<TintPair, "mix">>({
    a: color,
    b: color,
    front: 0,
  });
  if (color !== (pair.front === 0 ? pair.a : pair.b))
    setPair(
      pair.front === 0
        ? { ...pair, b: color, front: 1 }
        : { ...pair, a: color, front: 0 },
    );
  const mix = useSharedValue(0);
  useEffect(() => {
    mix.set(
      withTiming(pair.front, {
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [pair.front, mix]);
  return { ...pair, mix };
}

/**
 * Draws `children(color)` twice, stacked: the older tint opaque underneath and the newer one fading in on top.
 * `style` positions both copies.
 */
export function TintStack({
  tint,
  style,
  children,
}: {
  tint: TintPair;
  style: StyleProp<ViewStyle>;
  children: (color: string) => ReactNode;
}) {
  const under = tint.front === 0 ? 1 : 0;
  return (
    <>
      <TintLayer key={under} tint={tint} show={under} style={style}>
        {children}
      </TintLayer>
      <TintLayer key={tint.front} tint={tint} show={tint.front} style={style}>
        {children}
      </TintLayer>
    </>
  );
}

function TintLayer({
  tint,
  show,
  style,
  children,
}: {
  tint: TintPair;
  show: 0 | 1;
  style: StyleProp<ViewStyle>;
  children: (color: string) => ReactNode;
}) {
  const { front, mix } = tint;
  const fade = useAnimatedStyle(() => {
    if (front !== show) return { opacity: 1 };
    return { opacity: show === 1 ? mix.get() : 1 - mix.get() };
  });
  return (
    <Animated.View pointerEvents="none" style={[style, fade]}>
      {children(show === 0 ? tint.a : tint.b)}
    </Animated.View>
  );
}
