import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import { beatFeed, useBeatFeed } from "../beat-feed";
import { useCatCalm, useCatVisible } from "../use-cat-motion";
import { kittenFrame, SHEET } from "./kitten-frames";

const sheet = require("../../../../assets/cats/kitten.png");

// How far a jump rises, as a share of the kitten's height.
const LIFT = 0.3;

// Idles while paused, runs on the spot to the beat while music plays, and jumps when you like the song.
export function KittenCat({
  size,
  playing,
  liked,
}: {
  size: number;
  playing: boolean;
  liked: boolean;
}) {
  const visible = useCatVisible();
  const calm = useCatCalm();
  const run = visible && !calm;
  const scale = size / SHEET.frameH;
  const frameW = SHEET.frameW * scale;

  const index = useSharedValue(0);
  const lift = useSharedValue(0);
  const jumpAt = useSharedValue(0);
  const still = useSharedValue(!playing);

  useBeatFeed(playing && run);
  useEffect(() => {
    still.set(!playing);
  }, [playing, still]);
  useEffect(() => {
    if (liked && run) jumpAt.set(Date.now());
  }, [liked, run, jumpAt]);

  const loop = useFrameCallback(() => {
    const now = Date.now();
    const next = kittenFrame(
      !still.get(),
      now,
      beatFeed.beatMs.get(),
      jumpAt.get(),
    );
    if (next.index !== index.get()) index.set(next.index);
    if (next.lift !== lift.get()) lift.set(next.lift);
  }, false);
  useEffect(() => {
    loop.setActive(run);
    if (!run) {
      index.set(0);
      lift.set(0);
    }
  }, [run, loop, index, lift]);

  const hop = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.get() * size * LIFT }],
  }));
  const cell = useAnimatedStyle(() => ({
    transform: [
      { translateX: -(index.get() % SHEET.cols) * frameW },
      { translateY: -Math.floor(index.get() / SHEET.cols) * size },
    ],
  }));

  return (
    <Animated.View style={[{ width: frameW, height: size }, styles.clip, hop]}>
      <Animated.View
        style={[
          { width: SHEET.cols * frameW, height: SHEET.rows * size },
          cell,
        ]}
      >
        <Image
          source={sheet}
          contentFit="fill"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: "hidden" } });
