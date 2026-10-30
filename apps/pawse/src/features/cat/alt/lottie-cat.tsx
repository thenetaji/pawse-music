import LottieView from "lottie-react-native";
import { useEffect, useRef, useState } from "react";

import dance from "../../../../assets/cats/dance.json";
import sleep from "../../../../assets/cats/sleep.json";
import { tempoSpeed } from "../beat";
import { beatFeed, useBeatFeed } from "../beat-feed";
import { useCatCalm, useCatVisible } from "../use-cat-motion";

// The dance cat's feet end above the bottom of its picture; this puts them back on the wire.
const FEET = 0.12;

// Dances while music plays, sleeps when it's paused; the dance follows the song's tempo.
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
  const ref = useRef<LottieView>(null);
  const [speed, setSpeed] = useState(1);

  useBeatFeed(playing && run);
  useEffect(() => {
    if (!playing || !run) return;
    const id = setInterval(
      () => setSpeed(tempoSpeed(beatFeed.beatMs.get())),
      1000,
    );
    return () => clearInterval(id);
  }, [playing, run]);

  useEffect(() => {
    if (run) ref.current?.play();
    else ref.current?.pause();
  }, [run]);

  return (
    <LottieView
      key={playing ? "dance" : "sleep"}
      ref={ref}
      source={playing ? dance : sleep}
      autoPlay={run}
      loop
      speed={playing ? speed : 1}
      resizeMode="contain"
      style={{
        width: size,
        height: size,
        marginBottom: playing ? -size * FEET : 0,
      }}
    />
  );
}
