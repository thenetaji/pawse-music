import LottieView, { type AnimationObject } from "lottie-react-native";
import { memo, type Ref, useMemo } from "react";

type Props = {
  source: AnimationObject;
  size: number;
  autoPlay?: boolean;
  loop?: boolean;
  flip?: boolean;
  ref?: Ref<LottieView>;
};

// LottieView turns its whole animation into a JSON string on every render, so it only re-renders when these props change.
export const Lottie = memo(function Lottie({
  source,
  size,
  autoPlay,
  loop = true,
  flip,
  ref,
}: Props) {
  const style = useMemo(
    () => ({
      width: size,
      height: size,
      transform: flip ? [{ scaleX: -1 }] : undefined,
    }),
    [size, flip],
  );
  return (
    <LottieView
      ref={ref}
      source={source}
      autoPlay={autoPlay}
      loop={loop}
      resizeMode="contain"
      style={style}
    />
  );
});
