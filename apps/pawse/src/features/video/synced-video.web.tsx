import { getProgress, usePlayerStore } from "@pawse/player";
import Hls from "hls.js";
import { useEffect, useRef } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";

const DRIFT_SEC = 0.35;
const TICK_MS = 500;
// A seek needs a moment to land before drift means anything again.
const SETTLE_MS = 2000;

/** A song's video with no sound, following the music player: it plays, pauses and seeks along with the song. */
export function SyncedVideo({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  const el = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = el.current;
    if (!video) return;
    const hls = new Hls({ maxBufferLength: 20 });
    hls.loadSource(uri);
    hls.attachMedia(video);
    let seekedAt = 0;
    const tick = () => {
      const on = usePlayerStore.getState().status === "playing";
      const pos = getProgress().position;
      if (
        Date.now() - seekedAt > SETTLE_MS &&
        Math.abs(video.currentTime - pos) > DRIFT_SEC
      ) {
        video.currentTime = pos;
        seekedAt = Date.now();
      }
      if (on && video.paused) void video.play().catch(() => {});
      if (!on && !video.paused) video.pause();
    };
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(timer);
      hls.destroy();
    };
  }, [uri]);
  return (
    <View style={style}>
      <video
        ref={el}
        muted
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </View>
  );
}
