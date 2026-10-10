import { useEffect, useState } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** A ring that spins on the UI thread, so it keeps turning even while JS is busy. */
export function Spinner({
  size = 22,
  color = "#fff",
  width = 2.5,
}: {
  size?: number;
  color?: string;
  width?: number;
}) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.set(
      withRepeat(
        withTiming(360, { duration: 850, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(spin);
  }, [spin]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: width,
          borderColor: "rgba(255,255,255,0.22)",
          borderTopColor: color,
        },
        style,
      ]}
    />
  );
}

const SHOW_MS = 250;
const SLOW_MS = 6000;

/**
 * "loading" once the player has been loading or buffering a moment (short blips never flash a spinner),
 * "slow" after a few seconds of it, so a slow network reads as waiting rather than frozen.
 */
export function useBusy(status: string): "no" | "loading" | "slow" {
  const busy = status === "loading" || status === "buffering";
  const [stage, setStage] = useState<"no" | "loading" | "slow">("no");
  useEffect(() => {
    if (!busy) return;
    const a = setTimeout(() => setStage("loading"), SHOW_MS);
    const b = setTimeout(() => setStage("slow"), SLOW_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      setStage("no");
    };
  }, [busy]);
  return busy ? stage : "no";
}
